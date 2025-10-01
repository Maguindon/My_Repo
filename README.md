# Better. AI

A powerful AI comparison tool that allows you to send the same prompt to multiple AI services simultaneously and compare their responses side by side.

## 🌟 Features

- **Multi-AI Comparison**: Send one prompt to Claude (Anthropic), ChatGPT (OpenAI), and Gemini (Google) at the same time
- **Parallel Processing**: Fast, concurrent API calls using Promise.allSettled()
- **Real-time Responses**: Live comparison of AI responses as they arrive
- **Dark/Light Mode**: Beautiful theme switching with smooth transitions
- **Error Resilience**: Graceful handling of API failures with fallback responses
- **Responsive Design**: Works perfectly on desktop and mobile devices
- **Easy Setup**: Clear instructions for API key configuration
- **Prompt Library**: Store reusable prompts alongside Git commands with instant copy buttons and local persistence

## 🚀 Getting Started

### Prerequisites

- Node.js (version 14 or higher)
- npm or yarn
- API keys for the AI services you want to use

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd better-ai
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm start
```

4. Open [http://localhost:3000](http://localhost:3000) to view the app in your browser.

## 🔑 API Setup

The app works out-of-the-box with mock responses for testing. To use real AI APIs:

1. **Create a `.env` file** in your project root directory

2. **Add your API keys**:
```env
REACT_APP_ANTHROPIC_API_KEY=your_anthropic_api_key_here
REACT_APP_OPENAI_API_KEY=your_openai_api_key_here
REACT_APP_GEMINI_API_KEY=your_gemini_api_key_here
```

3. **Get your API keys**:
   - **Anthropic (Claude)**: [https://console.anthropic.com/](https://console.anthropic.com/)
   - **OpenAI (ChatGPT)**: [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys)
   - **Google (Gemini)**: [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)

4. **Restart your development server**:
```bash
npm start
```

> ⚠️ **Important**: Never commit your `.env` file to version control! Add `.env` to your `.gitignore` file.

## 🎯 How to Use

1. **Enter your prompt** in the text area
2. **Click "Send to All AI Tools"** to send the prompt to Claude, ChatGPT, and Gemini
3. **Compare responses** side by side as they arrive
4. **Open the Prompt Library tab** to copy default Git workflows or save your own prompts for reuse
5. **Toggle dark mode** using the moon/sun button in the header
6. **View setup instructions** by clicking "Show API Setup Instructions"

## 🛠️ Available Scripts

### `npm start`
Runs the app in development mode. Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

### `npm test`
Launches the test runner in interactive watch mode.

### `npm run build`
Builds the app for production to the `build` folder. Optimized for best performance.

### `npm run eject`
**Note: This is a one-way operation. Once you eject, you can't go back!**

## 🏗️ Project Structure

```
src/
├── App.js              # Main application component
├── App.css             # Styling with dark/light theme support
├── index.js            # Application entry point
└── api/
    └── aiServices.js   # API integration functions
```

## 🎨 Features in Detail

### **AI Integration**
- **Claude (Anthropic)**: Uses Claude 3 Sonnet model
- **ChatGPT (OpenAI)**: Uses GPT-4 model
- **Gemini (Google)**: Uses Gemini 1.5 Flash model
- **Parallel API Calls**: Both services called simultaneously for faster responses
- **Error Handling**: Individual service failures don't affect others

### **User Interface**
- **Modern Design**: Clean, professional interface with gradient backgrounds
- **Dark Mode**: Toggle between light and dark themes
- **Responsive**: Optimized for all screen sizes
- **Smooth Animations**: Elegant transitions and hover effects
- **Prompt Library**: Built-in tab with AI prompt templates, Git command shortcuts, copy-to-clipboard buttons, and local storage persistence

### **Developer Experience**
- **Environment Variables**: Secure API key management
- **Mock Responses**: Works without API keys for development
- **Error Boundaries**: Graceful error handling and user feedback

## 🔧 Customization

### Adding More AI Services

To add support for additional AI services:

1. Create a new API function in `src/api/aiServices.js`
2. Add the service to the `Promise.allSettled()` call in `App.js`
3. Add a new response card in the UI
4. Update the CSS for consistent styling

### Styling

The app uses CSS variables for easy theming. Modify the variables in `src/App.css` to customize colors:

```css
:root {
  --bg-primary: #f5f7fa;
  --text-primary: #333333;
  /* ... other variables */
}
```

## 📱 Browser Support

- Chrome (recommended)
- Firefox
- Safari
- Edge

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

## 🆘 Support

If you encounter any issues or have questions:

1. Check the [Issues](../../issues) page
2. Create a new issue with detailed information
3. Include your browser version and any error messages

## 🙏 Acknowledgments

- Built with [React](https://reactjs.org/)
- Styled with modern CSS and CSS variables
- AI services powered by [Anthropic](https://anthropic.com/), [OpenAI](https://openai.com/), and [Google AI Studio](https://aistudio.google.com/)

---

**Better. AI** - Compare AI responses, make better decisions. 🚀
