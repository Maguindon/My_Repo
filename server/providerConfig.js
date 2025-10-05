const PROVIDER_CONFIG = {
  anthropic: {
    id: 'anthropic',
    displayName: 'Anthropic Claude',
    apiBaseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-haiku-20240307',
    versionHeader: '2023-06-01',
    environmentKey: 'ANTHROPIC_API_KEY'
  },
  openai: {
    id: 'openai',
    displayName: 'OpenAI ChatGPT',
    apiBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    environmentKey: 'OPENAI_API_KEY'
  },
  gemini: {
    id: 'gemini',
    displayName: 'Google Gemini',
    apiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.5-flash',
    environmentKey: 'GEMINI_API_KEY'
  }
};

module.exports = { PROVIDER_CONFIG };
