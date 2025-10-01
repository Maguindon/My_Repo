import React, { useState } from 'react';
import './App.css';
import { callClaudeAPI, callChatGPTAPI, getSetupInstructions } from './api/aiServices';

function App() {
  const [prompt, setPrompt] = useState('');
  const [responses, setResponses] = useState({
    claude: null,
    chatgpt: null
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [darkMode, setDarkMode] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setLoading(true);
    setError(null);
    setResponses({ claude: null, chatgpt: null });

    try {
      // Make parallel API calls to both AI services
      const [claudeResponse, chatgptResponse] = await Promise.allSettled([
        callClaudeAPI(prompt),
        callChatGPTAPI(prompt)
      ]);

      setResponses({
        claude: claudeResponse.status === 'fulfilled' ? claudeResponse.value : { error: 'Failed to get Claude response' },
        chatgpt: chatgptResponse.status === 'fulfilled' ? chatgptResponse.value : { error: 'Failed to get ChatGPT response' }
      });
    } catch (err) {
      setError('An error occurred while fetching responses');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const [showSetupInstructions, setShowSetupInstructions] = useState(false);

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
  };

  return (
    <div className="App" data-theme={darkMode ? 'dark' : 'light'}>
      <header className="App-header">
        <div className="header-content">
          <h1>Better. AI</h1>
          <p>Send the same prompt to multiple AI services and compare responses</p>
          <div className="header-buttons">
            <button 
              className="dark-mode-button"
              onClick={toggleDarkMode}
              title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {darkMode ? '☀️' : '🌙'}
            </button>
            <button 
              className="setup-button"
              onClick={() => setShowSetupInstructions(!showSetupInstructions)}
            >
              {showSetupInstructions ? 'Hide' : 'Show'} API Setup Instructions
            </button>
          </div>
        </div>
      </header>
      
      <main className="App-main">
        {showSetupInstructions && (
          <div className="setup-instructions">
            <h3>{getSetupInstructions().title}</h3>
            <ol>
              {getSetupInstructions().steps.map((step, index) => (
                <li key={index}>{step}</li>
              ))}
            </ol>
            <p className="setup-note">{getSetupInstructions().note}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="prompt-form">
          <div className="input-group">
            <label htmlFor="prompt">Enter your prompt:</label>
            <textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Type your question or prompt here..."
              rows={4}
              disabled={loading}
            />
          </div>
          <button type="submit" disabled={loading || !prompt.trim()}>
            {loading ? 'Getting Responses...' : 'Send to All AI Tools'}
          </button>
        </form>

        {error && <div className="error-message">{error}</div>}

        {(responses.claude || responses.chatgpt) && (
          <div className="responses-container">
            <div className="response-card">
              <h3>🤖 Claude (Anthropic)</h3>
              {responses.claude ? (
                <div className="response-content">
                  <p className="model-info">Model: {responses.claude.model}</p>
                  <div className="response-text">
                    {responses.claude.error ? (
                      <p className="error-text">{responses.claude.error}</p>
                    ) : (
                      responses.claude.content.split('\n').map((line, index) => (
                        <p key={index}>{line}</p>
                      ))
                    )}
                  </div>
                </div>
              ) : (
                <div className="loading-placeholder">Waiting for response...</div>
              )}
            </div>

            <div className="response-card">
              <h3>🧠 ChatGPT (OpenAI)</h3>
              {responses.chatgpt ? (
                <div className="response-content">
                  <p className="model-info">Model: {responses.chatgpt.model}</p>
                  <div className="response-text">
                    {responses.chatgpt.error ? (
                      <p className="error-text">{responses.chatgpt.error}</p>
                    ) : (
                      responses.chatgpt.content.split('\n').map((line, index) => (
                        <p key={index}>{line}</p>
                      ))
                    )}
                  </div>
                </div>
              ) : (
                <div className="loading-placeholder">Waiting for response...</div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
