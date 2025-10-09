import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

beforeEach(() => {
  window.localStorage.clear();
});

test('shows AI comparison tools collapsed by default', () => {
  render(<App />);

  const toggleButton = screen.getByRole('button', { name: /model manager/i });
  expect(toggleButton).toBeInTheDocument();
  expect(toggleButton).toHaveAttribute('aria-label', expect.stringMatching(/show model manager/i));
  expect(screen.queryByText(/Model Manager/i)).not.toBeInTheDocument();

  fireEvent.click(toggleButton);
  expect(screen.getByRole('heading', { name: /Model Manager/i })).toBeInTheDocument();
  expect(toggleButton).toHaveAttribute('aria-label', expect.stringMatching(/hide model manager/i));
});

test('allows typing a full prompt in the comparison textarea', async () => {
  render(<App />);

  const promptBox = screen.getByLabelText(/enter your prompt/i);
  await userEvent.type(promptBox, 'T');
  expect(promptBox).toHaveValue('T');
  expect(document.activeElement).toBe(promptBox);

  await userEvent.type(promptBox, 'y');
  expect(promptBox).toHaveValue('Ty');

  await userEvent.type(promptBox, 'ping');
  expect(promptBox).toHaveValue('Typing');
});

test('optimizes a prompt when using the prompt optimizer tab', async () => {
  render(<App />);

  const optimizerTab = screen.getByRole('link', { name: /Optimize/i });
  fireEvent.click(optimizerTab);

  const promptInput = screen.getByLabelText(/paste or type your prompt/i);
  fireEvent.change(promptInput, { target: { value: 'D' } });
  expect(promptInput).toHaveValue('D');

  fireEvent.change(promptInput, { target: { value: 'Dr' } });
  expect(promptInput).toHaveValue('Dr');

  fireEvent.change(promptInput, {
    target: {
      value: 'Draft a summary of the Q4 board meeting with highlights on revenue, risks, and next steps for the product team.'
    }
  });

  fireEvent.click(screen.getByRole('button', { name: /optimize prompt/i }));

  expect(screen.getByRole('heading', { level: 2, name: /Optimized Prompt/i })).toBeInTheDocument();
  expect(screen.getByText(/Original Request/i)).toBeInTheDocument();

  fireEvent.change(promptInput, {
    target: {
      value: 'Draft a summary of the Q4 board meeting with highlights on revenue, risks, and next steps for the growth team.'
    }
  });

  expect(promptInput).toHaveValue(
    'Draft a summary of the Q4 board meeting with highlights on revenue, risks, and next steps for the growth team.'
  );
});

test('displays default git commands in the prompt library', () => {
  render(<App />);

  fireEvent.click(screen.getByRole('link', { name: /Library/i }));

  expect(screen.getByRole('heading', { level: 3, name: /Git Commands/i })).toBeInTheDocument();
  expect(screen.getByText('git pull origin main')).toBeInTheDocument();

  const copyButtons = screen.getAllByRole('button', { name: /Copy/i });
  expect(copyButtons.length).toBeGreaterThan(0);
});

test('allows adding and removing a custom prompt in the library', async () => {
  render(<App />);

  fireEvent.click(screen.getByRole('link', { name: /Library/i }));

  const promptsSection = screen.getByRole('heading', { level: 3, name: /Saved Prompts/i }).closest('section');
  expect(promptsSection).not.toBeNull();
  const promptsArea = within(promptsSection);

  await userEvent.type(promptsArea.getByLabelText(/Title/i), 'Weekly standup recap');
  await userEvent.type(
    promptsArea.getByLabelText(/Prompt text/i),
    'Share blockers, highlights, and upcoming milestones.'
  );

  await userEvent.click(promptsArea.getByRole('button', { name: /Save Prompt/i }));

  expect(screen.getByText(/Weekly standup recap/i)).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: /Remove/i }));
  expect(screen.queryByText(/Weekly standup recap/i)).not.toBeInTheDocument();
});

test('renders the Better.AI headline and prompt input', () => {
  render(<App />);
  expect(screen.getByRole('heading', { level: 1, name: /Better\. AI/ })).toBeInTheDocument();
  expect(screen.getByLabelText(/Enter your prompt/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Send to All AI Tools/i })).toBeInTheDocument();
});
