const express = require('express');
const dotenv = require('dotenv');
const bodyParser = require('body-parser');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Load environment variables from .env
dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

const GEMINI_FLASH_MODEL = 'gemini-2.5-flash'; // use this for all calls

const app = express();
app.use(bodyParser.json());
app.use(cors());

// --- Mock Data, same as Python ---
const mockQuestionsDB = {
  software_engineer: [
    { id: 1, text: 'Explain the difference between a list and a tuple in Python.' },
    { id: 2, text: 'What is a REST API?' },
    { id: 3, text: 'Describe the concept of Object-Oriented Programming.' }
  ],
  product_manager: [
    { id: 1, text: 'How do you prioritize features for a new product?' },
    { id: 2, text: 'What are some common KPIs for a SaaS product?' }
  ],
};

// --- Endpoint 1: /fetch-questions ---
app.post('/fetch-questions', async (req, res) => {
  const { role, num_questions = 5 } = req.body;
  if (!GEMINI_API_KEY) {
    // If API key not set, fallback immediately
    if (mockQuestionsDB[role]) {
      return res.json(mockQuestionsDB[role].slice(0, num_questions));
    }
    return res.status(500).json({ detail: 'Gemini API key not configured and no mock data.' });
  }
  try {
    const model = genAI.getGenerativeModel({ model: GEMINI_FLASH_MODEL });
    const prompt = `Generate ${num_questions} interview questions for a ${role} role. Provide only the questions, each on a new line.`;
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const questionsArr = text.split('\n').map((q, i) => ({ id: i + 1, text: q.trim() })).filter(q => q.text);
    if (!questionsArr.length) throw new Error('No questions from Gemini');
    return res.json(questionsArr);
  } catch (e) {
    // Fallback to mock data, as in Python
    if (mockQuestionsDB[role]) {
      return res.json(mockQuestionsDB[role].slice(0, num_questions));
    }
    res.status(500).json({ detail: `Error fetching questions from Gemini and no mock data: ${e.message}` });
  }
});

// --- Endpoint 2: /evaluate-answer ---
app.post('/evaluate-answer', async (req, res) => {
  const { question, answer, role } = req.body;
  if (!GEMINI_API_KEY) {
    // If API key not set, fallback to mock
    return res.json({ score: 0.75, feedback: 'This is a mock evaluation. The answer seems plausible.' });
  }
  try {
    const model = genAI.getGenerativeModel({ model: GEMINI_FLASH_MODEL });
    const prompt = `Evaluate the following answer for the question:\nQuestion: \"${question}\"\nAnswer: \"${answer}\"\nRole (for context, if applicable): \"${role}\"\n\nProvide a score from 0.0 to 1.0 (e.g., 0.75) and brief feedback.\nFormat your response as:\nScore: [score]\nFeedback: [feedback]`;
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    // Parse expected lines
    const scoreLine = text.split('\n').find(line => line.trim().startsWith('Score:'));
    const feedbackLine = text.split('\n').find(line => line.trim().startsWith('Feedback:'));
    if (!scoreLine || !feedbackLine) throw new Error('Could not parse response');
    const scoreStr = scoreLine.replace('Score:', '').trim();
    const feedback = feedbackLine.replace('Feedback:', '').trim();
    let score = Number(scoreStr);
    if (isNaN(score)) throw new Error('Invalid score from Gemini');
    return res.json({ score, feedback });
  } catch (e) {
    // Fallback mock logic
    return res.json({ score: 0.75, feedback: 'This is a mock evaluation. The answer seems plausible.' });
  }
});

// --- Run server ---
const PORT = process.env.PORT || 8001;
app.listen(PORT, () => {
  console.log(`Evaluator service running on port ${PORT}`);
});
