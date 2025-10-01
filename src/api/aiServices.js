// AI Services API Integration
// Replace these with your actual API keys and endpoints

// Configuration - Add your API keys here
const API_CONFIG = {
  anthropic: {
    apiKey: process.env.REACT_APP_ANTHROPIC_API_KEY || 'your-anthropic-api-key',
    baseUrl: 'https://api.anthropic.com/v1'
  },
  openai: {
    apiKey: process.env.REACT_APP_OPENAI_API_KEY || 'your-openai-api-key',
    baseUrl: 'https://api.openai.com/v1'
  }
};

// Claude API call
export const callClaudeAPI = async (prompt) => {
  try {
    const response = await fetch(`${API_CONFIG.anthropic.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_CONFIG.anthropic.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-sonnet-20240229',
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
      content: data.content[0].text,
      model: data.model
    };
  } catch (error) {
    console.error('Claude API error:', error);
    // Return mock response for demo purposes
    return {
      content: `Claude's response to: "${prompt}"\n\nThis is a mock response from Claude. To use the real API, add your Anthropic API key to the environment variables.\n\nError: ${error.message}`,
      model: 'claude-3-sonnet (mock)'
    };
  }
};

// ChatGPT API call
export const callChatGPTAPI = async (prompt) => {
  try {
    const response = await fetch(`${API_CONFIG.openai.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_CONFIG.openai.apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4',
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
      content: data.choices[0].message.content,
      model: data.model
    };
  } catch (error) {
    console.error('OpenAI API error:', error);
    // Return mock response for demo purposes
    return {
      content: `ChatGPT's response to: "${prompt}"\n\nThis is a mock response from ChatGPT. To use the real API, add your OpenAI API key to the environment variables.\n\nError: ${error.message}`,
      model: 'gpt-4 (mock)'
    };
  }
};

// Environment setup instructions
export const getSetupInstructions = () => {
  return {
    title: "API Setup Instructions",
    steps: [
      "1. Create a .env file in your project root directory",
      "2. Add your API keys to the .env file:",
      "   REACT_APP_ANTHROPIC_API_KEY=your_anthropic_key_here",
      "   REACT_APP_OPENAI_API_KEY=your_openai_key_here",
      "3. Get your API keys:",
      "   • Anthropic: https://console.anthropic.com/",
      "   • OpenAI: https://platform.openai.com/api-keys",
      "4. Restart your development server (npm start)",
      "5. The app will automatically use real APIs instead of mock responses"
    ],
    note: "Never commit your .env file to version control! Add .env to your .gitignore file."
  };
};
