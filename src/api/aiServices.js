// AI Services API Integration
// Centralised helpers to manage multiple providers/models and authentication state.

export const PROVIDER_CONFIG = {
  anthropic: {
    id: 'anthropic',
    displayName: 'Anthropic Claude',
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-sonnet-20240229',
    environmentKey: 'REACT_APP_ANTHROPIC_API_KEY',
    versionHeader: '2023-06-01'
  },
  openai: {
    id: 'openai',
    displayName: 'OpenAI ChatGPT',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4',
    environmentKey: 'REACT_APP_OPENAI_API_KEY'
  },
  gemini: {
    id: 'gemini',
    displayName: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-1.5-flash',
    environmentKey: 'REACT_APP_GEMINI_API_KEY'
  }
};

const getEnvironmentApiKey = (providerId) => {
  if (providerId === 'anthropic') {
    return process.env.REACT_APP_ANTHROPIC_API_KEY || '';
  }

  if (providerId === 'openai') {
    return process.env.REACT_APP_OPENAI_API_KEY || '';
  }

  if (providerId === 'gemini') {
    return process.env.REACT_APP_GEMINI_API_KEY || '';
  }

  return '';
};

const resolveApiKey = (providerId, overrideKey) => {
  const trimmed = overrideKey?.trim();
  if (trimmed) {
    return trimmed;
  }
  return getEnvironmentApiKey(providerId) || `missing-${providerId}-api-key`;
};

const anthropicRequest = async ({ prompt, model, apiKey }) => {
  const provider = PROVIDER_CONFIG.anthropic;

  try {
    const response = await fetch(`${provider.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': provider.versionHeader
      },
      body: JSON.stringify({
        model: model || provider.defaultModel,
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return {
      content: data.content?.[0]?.text || '',
      model: data.model || model || provider.defaultModel
    };
  } catch (error) {
    console.error('Claude API error:', error);
    return {
      content: `Claude's response to: "${prompt}"\n\nThis is a mock response from Claude. To use the real API, add your Anthropic API key to the environment variables or authenticate the model.\n\nError: ${error.message}`,
      model: model || `${provider.defaultModel} (mock)`
    };
  }
};

const openAIRequest = async ({ prompt, model, apiKey }) => {
  const provider = PROVIDER_CONFIG.openai;

  try {
    const response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model || provider.defaultModel,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 1000,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return {
      content: data.choices?.[0]?.message?.content || '',
      model: data.model || model || provider.defaultModel
    };
  } catch (error) {
    console.error('OpenAI API error:', error);
    return {
      content: `ChatGPT's response to: "${prompt}"\n\nThis is a mock response from ChatGPT. To use the real API, add your OpenAI API key to the environment variables or authenticate the model.\n\nError: ${error.message}`,
      model: model || `${provider.defaultModel} (mock)`
    };
  }
};

const geminiRequest = async ({ prompt, model, apiKey }) => {
  const provider = PROVIDER_CONFIG.gemini;
  const targetModel = encodeURIComponent(model || provider.defaultModel);
  const encodedKey = encodeURIComponent(apiKey);
  const url = `${provider.baseUrl}/models/${targetModel}:generateContent?key=${encodedKey}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          maxOutputTokens: 1024,
          temperature: 0.7
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    const content = parts
      .map((part) => part?.text)
      .filter(Boolean)
      .join('\n');

    return {
      content,
      model: data.model || model || provider.defaultModel
    };
  } catch (error) {
    console.error('Gemini API error:', error);
    return {
      content: `Gemini's response to: "${prompt}"\n\nThis is a mock response from Gemini. To use the real API, add your Google AI Studio key to the environment variables or authenticate the model.\n\nError: ${error.message}`,
      model: model || `${provider.defaultModel} (mock)`
    };
  }
};

export const callAIModel = async ({ providerId, prompt, model, apiKey }) => {
  const resolvedKey = resolveApiKey(providerId, apiKey);

  if (providerId === 'anthropic') {
    return anthropicRequest({ prompt, model, apiKey: resolvedKey });
  }

  if (providerId === 'openai') {
    return openAIRequest({ prompt, model, apiKey: resolvedKey });
  }

  if (providerId === 'gemini') {
    return geminiRequest({ prompt, model, apiKey: resolvedKey });
  }

  throw new Error(`Unsupported provider: ${providerId}`);
};

export const authenticateModel = async ({ providerId, apiKey }) => {
  const resolvedKey = resolveApiKey(providerId, apiKey);

  if (!resolvedKey || resolvedKey.startsWith('missing-')) {
    throw new Error('Missing API key. Add a key to authenticate this model.');
  }

  // In the current implementation we simply validate the presence of a key.
  // This keeps the UI responsive while avoiding unnecessary network calls.
  return {
    providerId,
    authenticatedAt: new Date().toISOString()
  };
};

// Legacy helpers kept for backwards compatibility (now using callAIModel under the hood)
export const callClaudeAPI = async (prompt) => {
  return callAIModel({ providerId: 'anthropic', prompt });
};

export const callChatGPTAPI = async (prompt) => {
  return callAIModel({ providerId: 'openai', prompt });
};

// Environment setup instructions
export const getSetupInstructions = () => {
  return {
    title: 'API Setup Instructions',
    steps: [
      '1. Create a .env file in your project root directory',
      '2. Add your API keys to the .env file:',
      '   REACT_APP_ANTHROPIC_API_KEY=your_anthropic_key_here',
      '   REACT_APP_OPENAI_API_KEY=your_openai_key_here',
      '   REACT_APP_GEMINI_API_KEY=your_gemini_key_here',
      '3. Restart your development server (npm start).',
      '4. Optionally store provider-specific keys in the model manager UI to override environment defaults.'
    ],
    note: 'Never commit your .env file to version control! Add .env to your .gitignore file.'
  };
};
