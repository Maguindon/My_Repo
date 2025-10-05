const https = require('https');
const path = require('path');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { PROVIDER_CONFIG } = require('./providerConfig');

if (process.env.NODE_ENV !== 'production') {
  // eslint-disable-next-line global-require
  require('dotenv').config({ path: path.join(__dirname, '.env') });
}

const app = express();

/* eslint-disable no-console */
console.log('\n=== Anthropic Key Check ===');
console.log('Key exists:', !!process.env.ANTHROPIC_API_KEY);
console.log('Key starts with:', process.env.ANTHROPIC_API_KEY?.substring(0, 15));
console.log('Key length:', process.env.ANTHROPIC_API_KEY?.length);
console.log('===========================\n');
/* eslint-enable no-console */

app.use(
  cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(morgan('tiny'));

const logAnthropicDebug = (message, payload) => {
  if (process.env.DEBUG_ANTHROPIC_KEY === 'true') {
    // eslint-disable-next-line no-console
    console.log(`[Anthropic Debug] ${message}`, payload);
  }
};

const postAnthropicJSON = ({ url, headers, payload }) =>
  new Promise((resolve, reject) => {
    const requestUrl = new URL(url);
    const bodyString = JSON.stringify(payload);

    const request = https.request(
      {
        protocol: requestUrl.protocol,
        hostname: requestUrl.hostname,
        port: requestUrl.port || 443,
        path: requestUrl.pathname + requestUrl.search,
        method: 'POST',
        headers: {
          ...headers,
          'Content-Length': Buffer.byteLength(bodyString)
        },
        timeout: 25_000,
        family: 4,
        rejectUnauthorized: true
      },
      (response) => {
        let raw = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          raw += chunk;
        });
        response.on('end', () => {
          resolve({
            status: response.statusCode,
            statusMessage: response.statusMessage,
            headers: response.headers,
            body: raw
          });
        });
      }
    );

    request.on('timeout', () => {
      request.destroy(new Error('Anthropic request timed out'));
    });

    request.on('error', (error) => {
      reject(error);
    });

    request.write(bodyString);
    request.end();
  });

const ensureApiKey = (providerId, overrideKey) => {
  const config = PROVIDER_CONFIG[providerId];
  if (!config) {
    throw new Error(`Unknown provider ${providerId}`);
  }

  const allowClientOverride = process.env.ALLOW_CLIENT_API_KEYS === 'true';
  const explicitKey = overrideKey?.trim();
  if (explicitKey && explicitKey !== 'undefined' && explicitKey !== 'null') {
    if (allowClientOverride) {
      logAnthropicDebug('Using client supplied API key override', {
        providerId,
        length: explicitKey.length,
        prefix: explicitKey.slice(0, 6),
        suffix: explicitKey.slice(-4)
      });
      return explicitKey;
    }

    logAnthropicDebug('Ignoring client supplied API key override', {
      providerId,
      reason: 'Server configured to prefer environment key',
      length: explicitKey.length
    });
  }

  const envKey = process.env[config.environmentKey];
  if (!envKey) {
    throw new Error(
      `Missing API key. Define ${config.environmentKey} in the server environment or authenticate a key for ${config.displayName}.`
    );
  }

  const sanitizedKey = envKey.trim().replace(/^['"]|['"]$/g, '');

  if (!sanitizedKey) {
    throw new Error(`The environment variable ${config.environmentKey} is defined but empty.`);
  }

  if (providerId === 'anthropic') {
    logAnthropicDebug('Raw env key preview', {
      length: envKey.length,
      prefix: envKey.slice(0, 8),
      suffix: envKey.slice(-8)
    });

    logAnthropicDebug('Sanitized key preview', {
      length: sanitizedKey.length,
      prefix: sanitizedKey.slice(0, 8),
      suffix: sanitizedKey.slice(-8)
    });

    const nonPrintable = sanitizedKey
      .split('')
      .map((char) => ({ char, code: char.charCodeAt(0) }))
      .filter(({ code }) => code < 32 || code > 126);

    if (nonPrintable.length > 0) {
      logAnthropicDebug('Sanitized key has non-printable chars', nonPrintable);
    }
  }

  return sanitizedKey;
};

const parseAnthropicContent = (contentBlocks = []) =>
  contentBlocks
    .map((block) => {
      if (typeof block === 'string') {
        return block;
      }
      return block?.text || block?.content || '';
    })
    .filter(Boolean)
    .join('\n');

app.post('/api/anthropic/messages', async (req, res) => {
  try {
    const { prompt, model, apiKey, maxTokens = 1024 } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Prompt is required.' });
    }

    const config = PROVIDER_CONFIG.anthropic;
    const resolvedKey = ensureApiKey('anthropic', apiKey);

    logAnthropicDebug('Request key details', {
      prefix: resolvedKey.slice(0, 8),
      suffix: resolvedKey.slice(-8),
      length: resolvedKey.length
    });

    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-api-key': resolvedKey,
      'anthropic-version': config.versionHeader,
      'anthropic-beta': 'messages-2023-12-15'
    };

    logAnthropicDebug('Request headers', {
      ...headers,
      'x-api-key': `${resolvedKey.slice(0, 6)}...${resolvedKey.slice(-4)}`
    });

    let response;

    try {
      response = await postAnthropicJSON({
        url: `${config.apiBaseUrl}/messages`,
        headers,
        payload: {
          model: model || config.defaultModel,
          max_tokens: maxTokens,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: prompt
                }
              ]
            }
          ]
        }
      });
    } catch (requestError) {
      logAnthropicDebug('Request failure', {
        message: requestError.message,
        stack: requestError.stack
      });
      return res.status(500).json({ error: requestError.message });
    }

    if (response.status >= 400) {
      return res.status(response.status).json({
        error: `Anthropic API error (${response.status} ${response.statusMessage}): ${response.body}`
      });
    }

    let data;
    try {
      data = JSON.parse(response.body);
    } catch (parseError) {
      logAnthropicDebug('Failed to parse Anthropic response JSON', {
        bodyPreview: response.body.slice(0, 200),
        error: parseError.message
      });
      return res.status(502).json({ error: 'Invalid JSON returned from Anthropic' });
    }
    const text = parseAnthropicContent(data.content);

    return res.json({
      content: text,
      model: data.model || model || config.defaultModel
    });
  } catch (error) {
    logAnthropicDebug('Request failure', {
      message: error.message,
      stack: error.stack,
      cause: error.cause ? { message: error.cause.message } : undefined
    });
    return res.status(500).json({ error: error.message });
  }
});

app.get('/debug/anthropic-key', (req, res) => {
  try {
    const key = ensureApiKey('anthropic');
    return res.json({
      exists: Boolean(key),
      length: key.length,
      prefix: key.slice(0, 8),
      suffix: key.slice(-8)
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/openai/chat/completions', async (req, res) => {
  try {
    const { prompt, model, apiKey, maxTokens = 1024, temperature = 0.7 } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Prompt is required.' });
    }

    const config = PROVIDER_CONFIG.openai;
    const resolvedKey = ensureApiKey('openai', apiKey);

    const response = await fetch(`${config.apiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resolvedKey}`
      },
      body: JSON.stringify({
        model: model || config.defaultModel,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: maxTokens,
        temperature
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return res.status(response.status).json({
        error: `OpenAI API error (${response.status}): ${errorBody}`
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    return res.json({
      content,
      model: data.model || model || config.defaultModel
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/gemini/generate', async (req, res) => {
  try {
    const { prompt, model, apiKey, maxOutputTokens = 2048, temperature = 0.7 } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Prompt is required.' });
    }

    const config = PROVIDER_CONFIG.gemini;
    const resolvedKey = ensureApiKey('gemini', apiKey);
    const targetModel = encodeURIComponent(model || config.defaultModel);
    const url = `${config.apiBaseUrl}/models/${targetModel}:generateContent?key=${encodeURIComponent(
      resolvedKey
    )}`;

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
          maxOutputTokens,
          temperature
        }
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return res.status(response.status).json({
        error: `Gemini API error (${response.status}): ${errorBody}`
      });
    }

    const data = await response.json();
    const [primaryCandidate] = data.candidates || [];
    const parts = primaryCandidate?.content?.parts || [];
    const textFragments = parts
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }

        if (typeof part?.text === 'string') {
          return part.text;
        }

        return '';
      })
      .map((fragment) => fragment.trim())
      .filter(Boolean);

    let content = textFragments.join('\n');
    const finishReason = primaryCandidate?.finishReason;

    if (content && finishReason === 'MAX_OUTPUT_TOKENS') {
      content = `${content}\n\n(Gemini stopped early after hitting the max output token limit of ${
        maxOutputTokens || 'the current'
      } tokens. Increase the limit if you need a longer reply.)`;
    }

    if (!content) {
      const blockReason = data.promptFeedback?.blockReason;
      const safetyRatings =
        primaryCandidate?.safetyRatings || data.promptFeedback?.safetyRatings || [];
      const blockedCategories = safetyRatings
        .filter((rating) => rating?.blocked)
        .map((rating) => rating.category)
        .filter(Boolean);

      if (blockReason || (finishReason && finishReason !== 'STOP') || blockedCategories.length) {
        const reasonParts = [];
        if (finishReason && finishReason !== 'STOP') {
          reasonParts.push(`finish reason: ${finishReason}`);
        }
        if (blockReason) {
          reasonParts.push(`block reason: ${blockReason}`);
        }
        if (blockedCategories.length > 0) {
          reasonParts.push(`safety categories: ${blockedCategories.join(', ')}`);
        }

        content = `Gemini did not return any text for this prompt (${
          reasonParts.join('; ') || 'no details provided'
        }). Try rephrasing or adjusting the request.`;
      }

      if (!content && finishReason === 'MAX_OUTPUT_TOKENS') {
        content = `Gemini reached the max output token limit of ${
          maxOutputTokens || 'the current'
        } tokens without returning text. Try increasing the limit or simplifying the prompt.`;
      }

      if (!content) {
        content = 'Gemini did not return any text. Check the server logs for the raw response.';
      }
    }

    return res.json({
      content,
      model: data.model || model || config.defaultModel
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`API server listening on port ${PORT}`);
});
