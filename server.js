import express from 'express';
import multer from 'multer';
import mammoth from 'mammoth';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import 'dotenv/config';

// --- Environment Variable Validation ---
function validateEnvironment() {
  const required = ['API_KEY'];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:', missing.join(', '));
    console.error('Please create a .env file with the following:');
    missing.forEach(key => console.error(`  ${key}=your_value_here`));
    process.exit(1);
  }

  // Validate API_KEY format
  if (process.env.API_KEY && process.env.API_KEY.length < 10) {
    console.warn('⚠️  API_KEY looks suspicious - might be invalid (too short)');
  }

  console.log('✅ Environment variables validated');
}

// Validate environment before continuing
validateEnvironment();

// --- Gemini API Configuration ---
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${process.env.API_KEY}`;
// ---

// --- Server Setup ---
const app = express();
const port = process.env.PORT || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// --- Middleware ---
app.use(express.json());
app.use(express.static(join(__dirname, 'Public'))); // Use 'Public' (uppercase)
const upload = multer({ storage: multer.memoryStorage() }); // Store files in memory

// --- Global variable to cache research text ---
let researchTextCache = "";
let researchFilesCache = []; // To store file names for context

// --- Helper Function for API Calls (JSON Response) ---
async function callGeminiForJson(payload, retryCount = 3) {
  for (let attempt = 0; attempt < retryCount; attempt++) {
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        let errorText = 'Unknown error';
        try {
          errorText = await response.text();
        } catch (e) {
          console.error('Failed to read error response:', e);
        }
        throw new Error(`API call failed with status: ${response.status} - ${errorText}`);
      }

      const result = await response.json();

      if (!result.candidates || !result.candidates[0] || !result.candidates[0].content) {
        console.error('Invalid API response:', JSON.stringify(result));
        throw new Error('Invalid response from AI API');
      }

      const safetyRatings = result.candidates[0].safetyRatings;
      if (safetyRatings) {
        const blockedRating = safetyRatings.find(rating => rating.blocked);
        if (blockedRating) {
          throw new Error(`API call blocked due to safety rating: ${blockedRating.category}`);
        }
      }
      
      const extractedJsonText = result.candidates[0].content.parts[0].text;
      return JSON.parse(extractedJsonText); // Return the parsed JSON

    } catch (error) {
      console.log(`Attempt ${attempt + 1} failed:`, error.message);
      if (attempt >= retryCount - 1) {
        throw error; // Throw the last error
      }
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
  throw new Error('All API retry attempts failed.');
}

// --- NEW Helper Function for API Calls (Text Response) ---
async function callGeminiForText(payload, retryCount = 3) {
  for (let attempt = 0; attempt < retryCount; attempt++) {
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        let errorText = 'Unknown error';
        try {
          errorText = await response.text();
        } catch (e) {
          console.error('Failed to read error response:', e);
        }
        throw new Error(`API call failed with status: ${response.status} - ${errorText}`);
      }

      const result = await response.json();

      if (!result.candidates || !result.candidates[0] || !result.candidates[0].content) {
        console.error('Invalid API response:', JSON.stringify(result));
        throw new Error('Invalid response from AI API');
      }

      const safetyRatings = result.candidates[0].safetyRatings;
      if (safetyRatings) {
        const blockedRating = safetyRatings.find(rating => rating.blocked);
        if (blockedRating) {
          throw new Error(`API call blocked due to safety rating: ${blockedRating.category}`);
        }
      }
      
      return result.candidates[0].content.parts[0].text; // Return raw text

    } catch (error) {
      console.log(`Attempt ${attempt + 1} failed:`, error.message);
      if (attempt >= retryCount - 1) {
        throw error; // Throw the last error
      }
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
  throw new Error('All API retry attempts failed.');
}


// --- Main Endpoint: /generate-chart ---
app.post('/generate-chart', upload.array('researchFiles'), async (req, res) => {
  const userPrompt = req.body.prompt;
  researchTextCache = ""; // Clear cache for new request
  researchFilesCache = []; // Clear cache

  // 1. Extract text from uploaded files (Sort for determinism)
  try {
    if (req.files) {
      const sortedFiles = req.files.sort((a, b) => a.originalname.localeCompare(b.originalname));
      for (const file of sortedFiles) {
        researchTextCache += `\n\n--- Start of file: ${file.originalname} ---\n`;
        researchFilesCache.push(file.originalname);

        // --- MODIFICATION: Use convertToHtml for .docx to preserve links ---
        if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
          // We convert to HTML to keep <a href="..."> tags
          const result = await mammoth.convertToHtml({ buffer: file.buffer });
          researchTextCache += result.value;
        } else {
          // .md and .txt files are kept as raw text
          researchTextCache += file.buffer.toString('utf8');
        }
        researchTextCache += `\n--- End of file: ${file.originalname} ---\n`;
      }
    }
  } catch (e) {
    console.error("File extraction error:", e);
    return res.status(500).json({ error: "Error processing uploaded files." });
  }

  // 2. Define the *single, powerful* system prompt
  const geminiSystemPrompt = `You are an expert project management analyst. Your job is to analyze a user's prompt and research files to build a complete Gantt chart data object.
  
  You MUST respond with *only* a valid JSON object matching the schema.
  
  **CRITICAL LOGIC:**
  1.  **TIME HORIZON:** First, check the user's prompt for an *explicitly requested* time range (e.g., "2020-2030").
      - If found, use that range.
      - If NOT found, find the *earliest* and *latest* date in all the research to create the range.
  2.  **TIME INTERVAL:** Based on the *total duration* of that range, you MUST choose an interval:
      - 0-3 months total: Use "Weeks" (e.g., ["W1 2026", "W2 2026"])
      - 4-12 months total: Use "Months" (e.g., ["Jan 2026", "Feb 2026"])
      - 1-3 years total: Use "Quarters" (e.g., ["Q1 2026", "Q2 2026"])
      - 3+ years total: You MUST use "Years" (e.g., ["2020", "2021", "2022"])
  3.  **CHART DATA:** Create the 'data' array.
      - First, identify all logical swimlanes (e.g., "Regulatory Drivers", "JPMorgan Chase"). Add an object for each: \`{ "title": "Swimlane Name", "isSwimlane": true, "entity": "Swimlane Name" }\`
      - Immediately after each swimlane, add all tasks that belong to it: \`{ "title": "Task Name", "isSwimlane": false, "entity": "Swimlane Name", "bar": { ... } }\`
      - **DO NOT** create empty swimlanes.
  4.  **BAR LOGIC:**
      - 'startCol' is the 1-based index of the 'timeColumns' array where the task begins.
      - 'endCol' is the 1-based index of the 'timeColumns' array where the task ends, **PLUS ONE**.
      - A task in "2022" has \`startCol: 3, endCol: 4\` (if 2020 is col 1).
      - If a date is "Q1 2024" and the interval is "Years", map it to the "2024" column index.
      - If a date is unknown ("null"), the 'bar' object must be \`{ "startCol": null, "endCol": null, "color": "..." }\`.
  5.  **COLORS & LEGEND:** This is a two-step process.
      a.  **Step 1: Find Cross-Swimlane Themes:** First, analyze ALL tasks from ALL swimlanes. Try to find logical, thematic groupings (e.g., "Regulatory Activity", "Product Launch", "Internal Review").
      b.  **Step 2: Assign Colors:** The available color names are: "priority-red", "medium-red", "mid-grey", "light-grey", "white", "dark-blue".
          * **PRIORITY:** You MUST prioritize using the colors in this order: "priority-red" first, then "medium-red", then "mid-grey". Only use "light-grey", "white", and "dark-blue" if you identify more than 3 logical groupings and need more colors.
          * **IF you find 2-6 strong thematic groupings:** Assign a unique color from the available list (respecting the priority) to each theme. Color ALL tasks belonging to that theme with its assigned color.
          * **IF you do this:** You MUST populate the 'legend' array, e.g., \`"legend": [{ "color": "priority-red", "label": "Regulatory Activity" }, { "color": "medium-red", "label": "Product Launch" }]\`.
          * **FALLBACK:** If you *cannot* find any logical themes, then do this instead: assign a *single, different* color (respecting the priority) to each swimlane (e.g., all tasks under "Swimlane A" are "priority-red", all tasks under "Swimlane B" are "medium-red").
          * **IF you use the FALLBACK:** The 'legend' array MUST be an empty array \`[]\`.
  6.  **SANITIZATION:** All string values MUST be valid JSON strings. You MUST properly escape any characters that would break JSON, such as double quotes (\") and newlines (\\n), within the string value itself.`;
  
  const geminiUserQuery = `User Prompt: "${userPrompt}"
  
**CRITICAL REMINDER:** You MUST escape all newlines (\\n) and double-quotes (\") found in the research content before placing them into the final JSON string values.

Research Content:
${researchTextCache}`;

  // 3. Define the schema for the *visual data only*
  const ganttSchema = {
    type: "OBJECT",
    properties: {
      title: { type: "STRING" },
      timeColumns: {
        type: "ARRAY",
        items: { type: "STRING" }
      },
      data: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            title: { type: "STRING" },
            isSwimlane: { type: "BOOLEAN" },
            entity: { type: "STRING" }, 
            bar: {
              type: "OBJECT",
              properties: {
                startCol: { type: "NUMBER" },
                endCol: { type: "NUMBER" },
                color: { type: "STRING" }
              },
            }
          },
          required: ["title", "isSwimlane", "entity"]
        }
      },
      legend: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            color: { type: "STRING" },
            label: { type: "STRING" }
          },
          required: ["color", "label"]
        }
      }
    },
    required: ["title", "timeColumns", "data", "legend"]
  };

  // 4. Define the payload
  const payload = {
    contents: [{ parts: [{ text: geminiUserQuery }] }],
    systemInstruction: { parts: [{ text: geminiSystemPrompt }] },
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: ganttSchema,
      maxOutputTokens: 8192,
      temperature: 0,
      topP: 1,
      topK: 1
    }
  };

  // 5. Call the API
  try {
    const ganttData = await callGeminiForJson(payload);
    
    // 6. Send the Gantt data to the frontend
    res.json(ganttData); // Send the object directly

  } catch (e) {
    console.error("API call error:", e);
    res.status(500).json({ error: `Error generating chart data: ${e.message}` });
  }
});


// -------------------------------------------------------------------
// --- "ON-DEMAND" ANALYSIS ENDPOINT ---
// -------------------------------------------------------------------
app.post('/get-task-analysis', async (req, res) => {
  const { taskName, entity } = req.body;

  if (!taskName || !entity) {
    return res.status(400).json({ error: "Missing taskName or entity" });
  }

  // 1. Define the "Analyst" prompt
  const geminiSystemPrompt = `You are a senior project management analyst. Your job is to analyze the provided research and a user prompt to build a detailed analysis for *one single task*.
  
  The 'Research Content' may contain raw HTML (from .docx files) and Markdown (from .md files). You MUST parse these.
  
  You MUST respond with *only* a valid JSON object matching the 'analysisSchema'.
  
  **CRITICAL RULES FOR ANALYSIS:**
  1.  **NO INFERENCE:** For 'taskName', 'facts', and 'assumptions', you MUST use key phrases and data extracted *directly* from the provided text.
  2.  **CITE SOURCES & URLS (HIERARCHY):** You MUST find a source and a URL (if possible) for every 'fact' and 'assumption'. Follow this logic:
      a.  **PRIORITY 1 (HTML Link):** Search for an HTML \`<a>\` tag near the fact.
          - 'source': The text inside the tag (e.g., "example.com").
          - 'url': The \`href\` attribute (e.g., "https://example.com/article/nine").
      b.  **PRIORITY 2 (Markdown Link):** Search for a Markdown link \`[text](url)\` near the fact.
          - 'source': The \`text\` part.
          - 'url': The \`url\` part.
      c.  **PRIORITY 3 (Fallback):** If no link is found, use the filename as the 'source'.
          - 'source': The filename (e.g., "FileA.docx") from the \`--- Start of file: ... ---\` wrapper.
          - 'url': You MUST set this to \`null\`.
  3.  **DETERMINE STATUS:** Determine the task's 'status' ("completed", "in-progress", or "not-started") based on the current date (assume "November 2025") and the task's dates.
  4.  **PROVIDE RATIONALE:** You MUST provide a 'rationale' for 'in-progress' and 'not-started' tasks, analyzing the likelihood of on-time completion based on the 'facts' and 'assumptions'.
  5.  **CLEAN STRINGS:** All string values MUST be valid JSON strings. You MUST properly escape any characters that would break JSON, such as double quotes (\") and newlines (\\n).`;
  
  const geminiUserQuery = `**CRITICAL REMINDER:** You MUST escape all newlines (\\n) and double-quotes (\") found in the research content before placing them into the final JSON string values.

Research Content:
${researchTextCache}

**YOUR TASK:** Provide a full, detailed analysis for this specific task:
  - Entity: "${entity}"
  - Task Name: "${taskName}"`;

  // 2. Define the *single-task* schema
  const analysisSchema = {
    type: "OBJECT",
    properties: {
      taskName: { type: "STRING" },
      startDate: { type: "STRING" },
      endDate: { type: "STRING" },
      status: { type: "STRING", enum: ["completed", "in-progress", "not-started", "n/a"] },
      facts: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            fact: { type: "STRING" },
            source: { type: "STRING" },
            url: { type: "STRING" } // Can be a URL string or null
          }
        }
      },
      assumptions: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            assumption: { type: "STRING" },
            source: { type: "STRING" },
            url: { type: "STRING" } // Can be a URL string or null
          }
        }
      },
      rationale: { type: "STRING" }, // For 'in-progress' or 'not-started'
      summary: { type: "STRING" } // For 'completed'
    },
    required: ["taskName", "status"]
  };
  
  // 3. Define the payload
  const payload = {
    contents: [{ parts: [{ text: geminiUserQuery }] }],
    systemInstruction: { parts: [{ text: geminiSystemPrompt }] },
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: analysisSchema,
      maxOutputTokens: 4096, // Plenty for a single task
      temperature: 0,
      topP: 1,
      topK: 1
    }
  };

  // 4. Call the API
  try {
    const analysisData = await callGeminiForJson(payload);
    res.json(analysisData); // Send the single-task analysis back
  } catch (e) {
    console.error("Task Analysis API error:", e);
    res.status(500).json({ error: `Error generating task analysis: ${e.message}` });
  }
});


// -------------------------------------------------------------------
// --- NEW "ASK A QUESTION" ENDPOINT ---
// -------------------------------------------------------------------
app.post('/ask-question', async (req, res) => {
  const { taskName, entity, question } = req.body;

  // Enhanced input validation
  if (!question || typeof question !== 'string' || !question.trim()) {
    return res.status(400).json({ error: 'Question is required and must be non-empty' });
  }

  if (!entity || typeof entity !== 'string' || !entity.trim()) {
    return res.status(400).json({ error: 'Entity is required' });
  }

  if (!taskName || typeof taskName !== 'string' || !taskName.trim()) {
    return res.status(400).json({ error: 'Task name is required' });
  }

  // Limit question length to prevent abuse
  if (question.trim().length > 1000) {
    return res.status(400).json({ error: 'Question too long (max 1000 characters)' });
  }

  // 1. Define the "Grounded Q&A" prompt
  const geminiSystemPrompt = `You are a project analyst. Your job is to answer a user's question about a specific task.
  
  **CRITICAL RULES:**
  1.  **GROUNDING:** You MUST answer the question *only* using the information in the provided 'Research Content'.
  2.  **CONTEXT:** Your answer MUST be in the context of the task: "${taskName}" (for entity: "${entity}").
  3.  **NO SPECULATION:** If the answer cannot be found in the 'Research Content', you MUST respond with "I'm sorry, I don't have enough information in the provided files to answer that question."
  4.  **CONCISE:** Keep your answer concise and to the point.
  5.  **NO PREAMBLE:** Do not start your response with "Based on the research..." just answer the question directly.`;
  
  const geminiUserQuery = `Research Content:\n${researchTextCache}\n\n**User Question:** ${question}`;

  // 2. Define the payload (no schema, simple text generation)
  const payload = {
    contents: [{ parts: [{ text: geminiUserQuery }] }],
    systemInstruction: { parts: [{ text: geminiSystemPrompt }] },
    generationConfig: {
      maxOutputTokens: 1024,
      temperature: 0.1, // Slight creativity for natural language
      topP: 1,
      topK: 1
    }
  };

  // 3. Call the *text* helper
  try {
    const textResponse = await callGeminiForText(payload);
    res.json({ answer: textResponse }); // Send the text answer back
  } catch (e) {
    console.error("Q&A API error:", e);
    res.status(500).json({ error: `Error generating answer: ${e.message}` });
  }
});


// --- Server Start ---
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});