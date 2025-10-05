// AI Services API Integration
// Centralised helpers to manage multiple providers/models and authentication state.

const API_BASE_URL = (process.env.REACT_APP_API_BASE_URL || '').replace(/\/$/, '');

export const PROVIDER_CONFIG = {
  anthropic: {
    id: 'anthropic',
    displayName: 'Anthropic Claude',
    defaultModel: 'claude-3-haiku-20240307'
  },
  openai: {
    id: 'openai',
    displayName: 'OpenAI ChatGPT',
    defaultModel: 'gpt-4o-mini'
  },
  gemini: {
    id: 'gemini',
    displayName: 'Google Gemini',
    defaultModel: 'gemini-2.5-flash'
  }
};

const buildBackendEndpoint = (providerId, path) => `${API_BASE_URL}/api/${providerId}${path}`;

const friendlyProviderName = (providerId) => {
  switch (providerId) {
    case 'anthropic':
      return 'Claude';
    case 'openai':
      return 'ChatGPT';
    case 'gemini':
      return 'Gemini';
    default:
      return providerId;
  }
};

const performBackendRequest = async ({
  providerId,
  path,
  payload,
  prompt,
  model
}) => {
  const config = PROVIDER_CONFIG[providerId];
  if (!config) {
    throw new Error(`Unsupported provider: ${providerId}`);
  }

  const fallbackModel = model || config.defaultModel;

  try {
    const response = await fetch(buildBackendEndpoint(providerId, path), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    let data;
    try {
      data = await response.json();
    } catch (parseError) {
      throw new Error('Failed to parse response payload');
    }

    if (!response.ok) {
      throw new Error(data?.error || response.statusText || 'Unknown error');
    }

    return {
      content: data.content || '',
      model: data.model || fallbackModel
    };
  } catch (error) {
    console.error(`${config.displayName} API error:`, error);
    const friendlyName = friendlyProviderName(providerId);
    return {
      content: `${friendlyName}'s response to: "${prompt}"

This is a mock response from ${friendlyName}. To use the real API, configure the server-side API key or authenticate the model.\n\nError: ${error.message}`,
      model: `${fallbackModel} (mock)`
    };
  }
};

const anthropicRequest = async ({ prompt, model, apiKey }) =>
  performBackendRequest({
    providerId: 'anthropic',
    path: '/messages',
    payload: {
      prompt,
      model,
      apiKey: apiKey?.trim() || undefined,
      maxTokens: 1024
    },
    prompt,
    model
  });

const openAIRequest = async ({ prompt, model, apiKey }) =>
  performBackendRequest({
    providerId: 'openai',
    path: '/chat/completions',
    payload: {
      prompt,
      model,
      apiKey: apiKey?.trim() || undefined,
      maxTokens: 1024,
      temperature: 0.7
    },
    prompt,
    model
  });

const geminiRequest = async ({ prompt, model, apiKey }) =>
  performBackendRequest({
    providerId: 'gemini',
    path: '/generate',
    payload: {
      prompt,
      model,
      apiKey: apiKey?.trim() || undefined,
      maxOutputTokens: 2048,
      temperature: 0.7
    },
    prompt,
    model
  });

export const callAIModel = async ({ providerId, prompt, model, apiKey }) => {
  if (!prompt || !prompt.trim()) {
    return {
      content: '',
      model: model || PROVIDER_CONFIG[providerId]?.defaultModel || ''
    };
  }

  if (providerId === 'anthropic') {
    return anthropicRequest({ prompt, model, apiKey });
  }

  if (providerId === 'openai') {
    return openAIRequest({ prompt, model, apiKey });
  }

  if (providerId === 'gemini') {
    return geminiRequest({ prompt, model, apiKey });
  }

  throw new Error(`Unsupported provider: ${providerId}`);
};

export const authenticateModel = async ({ providerId, apiKey }) => {
  const trimmedKey = apiKey?.trim();
  if (!providerId) {
    throw new Error('Unknown provider.');
  }

  if (trimmedKey) {
    return {
      providerId,
      authenticatedAt: new Date().toISOString()
    };
  }

  // Assume success when relying on server-managed keys.
  return {
    providerId,
    authenticatedAt: new Date().toISOString()
  };
};

// Legacy helpers retained for backwards compatibility
export const callClaudeAPI = async (prompt) => callAIModel({ providerId: 'anthropic', prompt });
export const callOpenAIAPI = async (prompt) => callAIModel({ providerId: 'openai', prompt });
export const callGeminiAPI = async (prompt) => callAIModel({ providerId: 'gemini', prompt });

export const getSetupInstructions = () => ({
  title: 'API Setup Instructions',
  steps: [
    '1. Create a .env file alongside server/index.js and add the API keys:',
    '   ANTHROPIC_API_KEY=your_anthropic_key_here',
    '   OPENAI_API_KEY=your_openai_key_here',
    '   GEMINI_API_KEY=your_google_key_here',
    '2. Optionally create a .env.local in the project root for frontend-specific settings (e.g. REACT_APP_API_BASE_URL).',
    '3. Install backend dependencies: npm install express cors dotenv morgan',
    '4. Start the backend with npm run server (defaults to http://localhost:3001).',
    '5. In a separate terminal run npm start to launch the React app.'
  ],
  note: 'Keep API keys on the server only. Do not expose keys in client-side code or commit them to version control.'
});
