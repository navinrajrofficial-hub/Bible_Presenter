// Handles the Gemini API Logic and chat-style modal for extracting verses from an image

let uploadedBase64Image = null;
let uploadedImageMimeType = null;
let extractedVersesData = []; // [{book, chapter, verse}]
let cachedBookRegex = null;
let cachedBookNames = null;

function openExtractVersesModal() {
  const modal = document.getElementById("extract-verses-modal");
  if (!modal) return;
  modal.style.display = "flex";
  resetAIChatState();
  const input = document.getElementById("ai-chat-input");
  if (input) input.focus();
}

function closeExtractVersesModal() {
  const modal = document.getElementById("extract-verses-modal");
  if (!modal) return;
  modal.style.display = "none";
}

function resetAIChatState() {
  uploadedBase64Image = null;
  uploadedImageMimeType = null;
  extractedVersesData = [];

  const preview = document.getElementById("ai-input-image-preview");
  const previewWrap = document.getElementById("ai-input-preview-container");
  if (preview) preview.src = "";
  if (previewWrap) previewWrap.style.display = "none";

  const input = document.getElementById("ai-chat-input");
  if (input) input.value = "";

  const actions = document.getElementById("ai-chat-actions");
  const checklist = document.getElementById("ai-chat-checklist");
  if (actions) actions.style.display = "none";
  if (checklist) checklist.innerHTML = "";

  const history = document.getElementById("ai-chat-history");
  if (history && history.children.length > 1) {
    while (history.children.length > 1) {
      history.removeChild(history.lastChild);
    }
  }
}

function initAIVerseAssistant() {
  const input = document.getElementById("ai-chat-input");
  if (!input) return;

  input.addEventListener("paste", handleAIPaste);
}

function handleAIPaste(event) {
  if (!event.clipboardData || !event.clipboardData.items) return;

  const items = Array.from(event.clipboardData.items);
  const imageItem = items.find((item) => item.type && item.type.startsWith("image/"));

  if (!imageItem) return;

  event.preventDefault();
  const file = imageItem.getAsFile();
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const dataUrl = e.target.result;
    if (!dataUrl) return;

    const parts = dataUrl.split(",");
    if (parts.length < 2) return;

    uploadedBase64Image = parts[1];
    uploadedImageMimeType = file.type || "image/png";

    const preview = document.getElementById("ai-input-image-preview");
    const previewWrap = document.getElementById("ai-input-preview-container");
    if (preview) preview.src = dataUrl;
    if (previewWrap) previewWrap.style.display = "block";
  };
  reader.readAsDataURL(file);
}

function clearAIImage() {
  uploadedBase64Image = null;
  uploadedImageMimeType = null;
  const preview = document.getElementById("ai-input-image-preview");
  const previewWrap = document.getElementById("ai-input-preview-container");
  if (preview) preview.src = "";
  if (previewWrap) previewWrap.style.display = "none";
}

function processAIInput() {
  const input = document.getElementById("ai-chat-input");
  const textValue = input ? input.value.trim() : "";

  if (!uploadedBase64Image && !textValue) return;

  if (textValue) {
    appendChatMessage("user", textValue, { isText: true });
  }
  if (uploadedBase64Image) {
    appendChatMessage("user", "[image pasted]", { isImage: true });
  }

  if (input) input.value = "";

  if (uploadedBase64Image) {
    extractVersesFromImage();
  } else if (textValue) {
    const parsed = extractRefsFromText(textValue);
    if (parsed.length === 0) {
      appendChatMessage("assistant", "No Bible references found in the pasted text.");
      return;
    }
    let addedCount = 0;
    parsed.forEach((ref) => {
      const added = addVerseToMain(ref.book, ref.chapter, ref.verse);
      if (added) addedCount++;
    });
    appendChatMessage("assistant", `Added ${addedCount} verse(s) from pasted text.`);
  }
}

function appendChatMessage(role, content, options) {
  const history = document.getElementById("ai-chat-history");
  if (!history) return;

  const wrapper = document.createElement("div");
  wrapper.className = `ai-chat-row ${role}`;

  const bubble = document.createElement("div");
  bubble.className = `ai-chat-bubble ${role}`;

  if (options && options.isImage) {
    const img = document.createElement("img");
    img.src = document.getElementById("ai-input-image-preview").src || "";
    img.alt = "Pasted image";
    img.className = "ai-chat-image";
    bubble.appendChild(img);
  } else {
    bubble.textContent = content;
  }

  wrapper.appendChild(bubble);
  history.appendChild(wrapper);
  history.scrollTop = history.scrollHeight;
}

function getSelectedProvider() {
  const select = document.getElementById("ai-provider-select");
  if (!select) return "gemini";
  return select.value || "gemini";
}

async function listAvailableModels() {
  const provider = getSelectedProvider();

  if (provider === "openai") {
    await listOpenAIModels();
    return;
  }

  if (provider === "groq") {
    await listGroqModels();
    return;
  }

  if (provider === "openrouter") {
    await listOpenRouterModels();
    return;
  }

  if (!AI_CONFIG || !AI_CONFIG.apiKey || AI_CONFIG.apiKey === "YOUR_API_KEY_HERE") {
    appendChatMessage("assistant", "Please configure your Gemini API Key in ai_config.js first.");
    return;
  }

  appendChatMessage("assistant", "Fetching Gemini models...");

  const apiUrl = `https://generativelanguage.googleapis.com/v1/models?key=${AI_CONFIG.apiKey}`;

  try {
    const response = await fetch(apiUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error && errData.error.message ? errData.error.message : "List models failed");
    }

    const data = await response.json();
    const models = Array.isArray(data.models) ? data.models : [];
    const usable = models.filter((model) => {
      const methods = model.supportedGenerationMethods || [];
      return methods.includes("generateContent");
    });

    if (usable.length === 0) {
      appendChatMessage("assistant", "No models with generateContent are available for this key.");
      return;
    }

    const lines = usable
      .map((model) => model.name || "")
      .filter((name) => name.length > 0)
      .sort();

    appendChatMessage(
      "assistant",
      "Available Gemini models:\n" + lines.join("\n")
    );
  } catch (error) {
    appendChatMessage("assistant", `Error: ${error.message}`);
    console.error("List models error:", error);
  }
}

async function listOpenAIModels() {
  if (!AI_CONFIG || !AI_CONFIG.openaiApiKey || AI_CONFIG.openaiApiKey === "YOUR_OPENAI_KEY_HERE") {
    appendChatMessage("assistant", "Please configure your OpenAI API Key in ai_config.js first.");
    return;
  }

  appendChatMessage("assistant", "Fetching OpenAI models...");

  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${AI_CONFIG.openaiApiKey}`
      }
    });

    if (!response.ok) {
      const errData = await response.json();
      const message = errData && errData.error && errData.error.message ? errData.error.message : "List models failed";
      throw new Error(message);
    }

    const data = await response.json();
    const models = Array.isArray(data.data) ? data.data : [];
    const lines = models
      .map((model) => model.id || "")
      .filter((name) => name.length > 0)
      .sort();

    if (lines.length === 0) {
      appendChatMessage("assistant", "No models returned by OpenAI.");
      return;
    }

    appendChatMessage(
      "assistant",
      "Available OpenAI models:\n" + lines.join("\n")
    );
  } catch (error) {
    appendChatMessage("assistant", `Error: ${error.message}`);
    console.error("List OpenAI models error:", error);
  }
}

async function listGroqModels() {
  if (!AI_CONFIG || !AI_CONFIG.groqApiKey || AI_CONFIG.groqApiKey === "YOUR_GROQ_KEY_HERE") {
    appendChatMessage("assistant", "Please configure your Groq API Key in ai_config.js first.");
    return;
  }

  appendChatMessage("assistant", "Fetching Groq models...");

  try {
    const response = await fetch("https://api.groq.com/openai/v1/models", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${AI_CONFIG.groqApiKey}`
      }
    });

    if (!response.ok) {
      const errData = await response.json();
      const message = errData && errData.error && errData.error.message ? errData.error.message : "List models failed";
      throw new Error(message);
    }

    const data = await response.json();
    const models = Array.isArray(data.data) ? data.data : [];
    const lines = models
      .map((model) => model.id || "")
      .filter((name) => name.length > 0)
      .sort();

    if (lines.length === 0) {
      appendChatMessage("assistant", "No models returned by Groq.");
      return;
    }

    const vision = lines.filter((name) => isGroqVisionModel(name));
    const others = lines.filter((name) => !isGroqVisionModel(name));
    const visionBlock = vision.length > 0 ? "Vision models:\n" + vision.join("\n") : "Vision models: (none)";
    const otherBlock = others.length > 0 ? "Other models:\n" + others.join("\n") : "Other models: (none)";

    appendChatMessage("assistant", visionBlock + "\n\n" + otherBlock);
  } catch (error) {
    appendChatMessage("assistant", `Error: ${error.message}`);
    console.error("List Groq models error:", error);
  }
}

async function listOpenRouterModels() {
  appendChatMessage("assistant", "Fetching OpenRouter models...");

  try {
    const response = await fetch("https://openrouter.ai/api/v1/models");

    if (!response.ok) {
      const errData = await response.json();
      const message = errData && errData.error && errData.error.message ? errData.error.message : "List models failed";
      throw new Error(message);
    }


    const data = await response.json();
    const models = Array.isArray(data.data) ? data.data : [];
    const lines = models
      .map((model) => model.id || "")
      .filter((name) => name.length > 0)
      .sort();

    if (lines.length === 0) {
      appendChatMessage("assistant", "No models returned by OpenRouter.");
      return;
    }

    appendChatMessage(
      "assistant",
      "Available OpenRouter models:\n" + lines.join("\n")
    );
  } catch (error) {
    appendChatMessage("assistant", `Error: ${error.message}`);
    console.error("List OpenRouter models error:", error);
  }
}

const UNIVERSAL_AI_PROMPT = `
Analyze this image and identify all the Tamil Bible verse references.
Read the text horizontally first, then vertically.

Return the result strictly as a JSON object with two fields:
- "verses": an array of strictly parsed objects.
- "unparseable": an array of strings representing lines you could not parse.

For "verses", map each verse to an object with exactly these keys:
"book" (Full Tamil book name, e.g., "சங்கீதம்", "மத்தேயு", "லூக்கா"). Resolve abbreviations (e.g., "மத்" -> "மத்தேயு", "லூக்" -> "லூக்கா").
"chapter" (number),
"verse" (number).

Important Context & Rules:
1. Shortened forms like "லூக்" should be expanded to "லூக்கா". Match to common standard Tamil Bible book namings.
2. If text contains a range like "1-5" (e.g., "மத்தேயு 1:1-5"), expand it! Expand it to create 5 objects: chapter 1 verse 1, chapter 1 verse 2, chapter 1 verse 3, chapter 1 verse 4, and chapter 1 verse 5.
3. Ignore extra content, titles, or commentary. Focus only on book, chapter, and verse references.
4. If a line looks like a reference but lacks clear book/chapter/verse, place its literal text into the "unparseable" array.

Example Response Format:
{
  "verses": [
    {"book": "சங்கீதம்", "chapter": 35, "verse": 1},
    {"book": "யோவான்", "chapter": 3, "verse": 16},
    {"book": "லூக்கா", "chapter": 2, "verse": 1},
    {"book": "லூக்கா", "chapter": 2, "verse": 2}
  ],
  "unparseable": [
    "பாடல்கள் - 5",
    "Some unreadable text"
  ]
}

Do not include any explanation, markdown formatting, or text outside the JSON object.
`;

function extractRefsFromText(text) {
  if (!text) return [];

  const trimmed = text.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      let list = [];
      if (Array.isArray(parsed)) {
          list = parsed;
      } else if (parsed && Array.isArray(parsed.verses)) {
          list = parsed.verses;
      }

      const normalized = list
        .filter((item) => item && item.book && item.chapter && item.verse)
        .map((item) => ({
          book: String(item.book).trim(),
          chapter: parseInt(item.chapter, 10),
          verse: parseInt(item.verse, 10)
        }))
        .filter((item) => !Number.isNaN(item.chapter) && !Number.isNaN(item.verse));

      return dedupeRefs(normalized);
    } catch (e) {
      // Continue with regex parsing if JSON fails.
    }
  }

  const bookPattern = getBookRegex();
  if (!bookPattern) return [];

  const refs = [];
  const regex = new RegExp(`${bookPattern}\\s*(\\d{1,3})\\s*[:.\\-]\\s*(\\d{1,3})`, "g");
  let match = null;
  while ((match = regex.exec(text)) !== null) {
    const book = match[1];
    const chapter = parseInt(match[2], 10);
    const verse = parseInt(match[3], 10);
    if (!Number.isNaN(chapter) && !Number.isNaN(verse)) {
      refs.push({ book, chapter, verse });
    }
  }

  return dedupeRefs(refs);
}

function dedupeRefs(refs) {
  const seen = new Set();
  const unique = [];
  refs.forEach((ref) => {
    const key = `${ref.book}|${ref.chapter}|${ref.verse}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(ref);
    }
  });
  return unique;
}

function getBookRegex() {
  if (cachedBookRegex) return cachedBookRegex;

  let names = [];
  if (typeof bibleData !== "undefined" && Array.isArray(bibleData)) {
    names = bibleData
      .map((b) => (b && b.BookName ? b.BookName.trim() : ""))
      .filter((name) => name.length > 0);
  }

  if (names.length === 0) return null;

  cachedBookNames = names.sort((a, b) => b.length - a.length);
  const escaped = cachedBookNames.map((name) => name.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&"));

  cachedBookRegex = `(${escaped.join("|")})`;
  return cachedBookRegex;
}

async function extractVersesFromImage() {
  if (!uploadedBase64Image) {
    appendChatMessage("assistant", "Please paste an image first (Ctrl+V).");
    return;
  }

  const provider = getSelectedProvider();

  if (provider === "openai") {
    appendChatMessage("assistant", "Processing image with OpenAI...");
    await extractVersesWithOpenAI();
    return;
  }

  if (provider === "groq") {
    appendChatMessage("assistant", "Processing image with Groq...");
    await extractVersesWithGroq();
    return;
  }

  if (provider === "openrouter") {
    appendChatMessage("assistant", "Processing image with OpenRouter...");
    await extractVersesWithOpenRouter();
    return;
  }

  appendChatMessage("assistant", "Processing image with Gemini AI...");

  if (!AI_CONFIG || !AI_CONFIG.apiKey || AI_CONFIG.apiKey === "YOUR_API_KEY_HERE") {
    appendChatMessage("assistant", "Please configure your Gemini API Key in ai_config.js first.");
    return;
  }

  const model = AI_CONFIG.model || "gemini-1.5-flash";
  const apiUrl = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${AI_CONFIG.apiKey}`;

  const promptText = UNIVERSAL_AI_PROMPT;

  const requestBody = {
    contents: [
      {
        parts: [
          { text: promptText },
          {
            inlineData: {
              mimeType: uploadedImageMimeType || "image/png",
              data: uploadedBase64Image
            }
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1
    }
  };

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error && errData.error.message ? errData.error.message : "API Request Failed");
    }

    const data = await response.json();
    let textResponse = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] ? data.candidates[0].content.parts[0].text : "";

    if (!textResponse) {
      appendChatMessage("assistant", "Empty response from AI.");
      return;
    }

    textResponse = textResponse.replace(/```json/g, "").replace(/```/g, "").trim();

    let parsedVerses = [];
    let unparseable = [];
    try {
      const parsedData = JSON.parse(textResponse);
      if (Array.isArray(parsedData)) {
          parsedVerses = parsedData;
      } else if (parsedData.verses) {
          parsedVerses = parsedData.verses || [];
          unparseable = parsedData.unparseable || [];
      }
    } catch (e) {
      console.error("Failed to parse Gemini response:", textResponse);
      appendChatMessage("assistant", "Failed to parse AI response. Check console for details.");
      return;
    }

    if (!Array.isArray(parsedVerses) || parsedVerses.length === 0) {
      appendChatMessage("assistant", "No Bible verses found in the image.");
      if (unparseable.length > 0) {
        appendChatMessage("assistant", "Unparseable lines:\n" + unparseable.join("\n"));
      }
      return;
    }

    extractedVersesData = parsedVerses;
    renderExtractedVerses(parsedVerses);
    appendChatMessage("assistant", `Found ${parsedVerses.length} verse(s). Review and add to slides below.`);
    if (unparseable.length > 0) {
        appendChatMessage("assistant", "Unparseable lines (please add manually):\n" + unparseable.join("\n"));
    }
  } catch (error) {
    appendChatMessage("assistant", `Error: ${error.message}`);
    console.error("Gemini API Error:", error);
  }
}

async function extractVersesWithOpenAI() {
  if (!AI_CONFIG || !AI_CONFIG.openaiApiKey || AI_CONFIG.openaiApiKey === "YOUR_OPENAI_KEY_HERE") {
    appendChatMessage("assistant", "Please configure your OpenAI API Key in ai_config.js first.");
    return;
  }

  const model = AI_CONFIG.openaiModel || "gpt-4o";
  const apiUrl = "https://api.openai.com/v1/responses";

  const promptText = UNIVERSAL_AI_PROMPT;

  const imageUrl = `data:${uploadedImageMimeType || "image/png"};base64,${uploadedBase64Image}`;

  const requestBody = {
    model,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: promptText },
          { type: "input_image", image_url: imageUrl }
        ]
      }
    ]
  };

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${AI_CONFIG.openaiApiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errData = await response.json();
      const message = errData && errData.error && errData.error.message ? errData.error.message : "OpenAI request failed";
      throw new Error(message);
    }

    const data = await response.json();
    const textResponse = extractOpenAIText(data);
    if (!textResponse) {
      appendChatMessage("assistant", "Empty response from OpenAI.");
      return;
    }

    let parsedVerses = [];
    let unparseable = [];
    try {
      const parsedData = JSON.parse(textResponse);
      if (Array.isArray(parsedData)) {
          parsedVerses = parsedData;
      } else if (parsedData.verses) {
          parsedVerses = parsedData.verses || [];
          unparseable = parsedData.unparseable || [];
      }
    } catch (e) {
      console.error("Failed to parse OpenAI response:", textResponse);
      appendChatMessage("assistant", "Failed to parse OpenAI response. Check console for details.");
      return;
    }

    if (!Array.isArray(parsedVerses) || parsedVerses.length === 0) {
      appendChatMessage("assistant", "No Bible verses found in the image.");
      if (unparseable.length > 0) {
        appendChatMessage("assistant", "Unparseable lines:\n" + unparseable.join("\n"));
      }
      return;
    }

    extractedVersesData = parsedVerses;
    renderExtractedVerses(parsedVerses);
    appendChatMessage("assistant", `Found ${parsedVerses.length} verse(s). Review and add to slides below.`);
    if (unparseable.length > 0) {
        appendChatMessage("assistant", "Unparseable lines (please add manually):\n" + unparseable.join("\n"));
    }
  } catch (error) {
    appendChatMessage("assistant", `Error: ${error.message}`);
    console.error("OpenAI API Error:", error);
  }
}

function extractOpenAIText(data) {
  if (!data || !Array.isArray(data.output)) return "";
  for (let i = 0; i < data.output.length; i++) {
    const item = data.output[i];
    if (!item || !Array.isArray(item.content)) continue;
    for (let j = 0; j < item.content.length; j++) {
      const part = item.content[j];
      if (part && part.type === "output_text" && part.text) {
        return part.text.trim().replace(/```json/g, "").replace(/```/g, "").trim();
      }
    }
  }
  return "";
}

async function extractVersesWithGroq() {
  if (!AI_CONFIG || !AI_CONFIG.groqApiKey || AI_CONFIG.groqApiKey === "YOUR_GROQ_KEY_HERE") {
    appendChatMessage("assistant", "Please configure your Groq API Key in ai_config.js first.");
    return;
  }

  const model = AI_CONFIG.groqModel || "llama-3.2-11b-vision-preview";
  if (!isGroqVisionModel(model)) {
    appendChatMessage("assistant", "Selected Groq model does not support images. Choose a Groq vision model (name contains 'vision').");
    return;
  }
  const apiUrl = "https://api.groq.com/openai/v1/chat/completions";

  const promptText = UNIVERSAL_AI_PROMPT;

  const imageUrl = `data:${uploadedImageMimeType || "image/png"};base64,${uploadedBase64Image}`;

  const requestBody = {
    model,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: promptText },
          { type: "image_url", image_url: { url: imageUrl } }
        ]
      }
    ],
    temperature: 0.1
  };

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${AI_CONFIG.groqApiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errData = await response.json();
      const message = errData && errData.error && errData.error.message ? errData.error.message : "Groq request failed";
      throw new Error(message);
    }

    const data = await response.json();
    const textResponse = extractGroqText(data);
    if (!textResponse) {
      appendChatMessage("assistant", "Empty response from Groq.");
      return;
    }

    let parsedVerses = [];
    let unparseable = [];
    try {
      const parsedData = JSON.parse(textResponse);
      if (Array.isArray(parsedData)) {
          parsedVerses = parsedData;
      } else if (parsedData.verses) {
          parsedVerses = parsedData.verses || [];
          unparseable = parsedData.unparseable || [];
      }
    } catch (e) {
      console.error("Failed to parse Groq response:", textResponse);
      appendChatMessage("assistant", "Failed to parse Groq response. Check console for details.");
      return;
    }

    if (!Array.isArray(parsedVerses) || parsedVerses.length === 0) {
      appendChatMessage("assistant", "No Bible verses found in the image.");
      if (unparseable.length > 0) {
        appendChatMessage("assistant", "Unparseable lines:\n" + unparseable.join("\n"));
      }
      return;
    }

    extractedVersesData = parsedVerses;
    renderExtractedVerses(parsedVerses);
    appendChatMessage("assistant", `Found ${parsedVerses.length} verse(s). Review and add to slides below.`);
    if (unparseable.length > 0) {
        appendChatMessage("assistant", "Unparseable lines (please add manually):\n" + unparseable.join("\n"));
    }
  } catch (error) {
    appendChatMessage("assistant", `Error: ${error.message}`);
    console.error("Groq API Error:", error);
  }
}

async function extractVersesWithOpenRouter() {
  if (!AI_CONFIG || !AI_CONFIG.openrouterApiKey || AI_CONFIG.openrouterApiKey === "YOUR_OPENROUTER_KEY_HERE") {
    appendChatMessage("assistant", "Please configure your OpenRouter API Key in ai_config.js first.");
    return;
  }

  const model = AI_CONFIG.openrouterModel || "openai/gpt-4o-mini";
  const apiUrl = "https://openrouter.ai/api/v1/chat/completions";

  const promptText = UNIVERSAL_AI_PROMPT;

  const imageUrl = `data:${uploadedImageMimeType || "image/png"};base64,${uploadedBase64Image}`;

  const requestBody = {
    model,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: promptText },
          { type: "image_url", image_url: { url: imageUrl } }
        ]
      }
    ],
    temperature: 0.1
  };

  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${AI_CONFIG.openrouterApiKey}`
  };

  if (AI_CONFIG.openrouterReferer) {
    headers["HTTP-Referer"] = AI_CONFIG.openrouterReferer;
  }
  if (AI_CONFIG.openrouterTitle) {
    headers["X-Title"] = AI_CONFIG.openrouterTitle;
  }

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errData = await response.json();
      const message = errData && errData.error && errData.error.message ? errData.error.message : "OpenRouter request failed";
      throw new Error(message);
    }

    const data = await response.json();
    const textResponse = extractOpenRouterText(data);
    if (!textResponse) {
      appendChatMessage("assistant", "Empty response from OpenRouter.");
      return;
    }

    let parsedVerses = [];
    let unparseable = [];
    try {
      const parsedData = JSON.parse(textResponse);
      if (Array.isArray(parsedData)) {
          parsedVerses = parsedData;
      } else if (parsedData.verses) {
          parsedVerses = parsedData.verses || [];
          unparseable = parsedData.unparseable || [];
      }
    } catch (e) {
      console.error("Failed to parse OpenRouter response:", textResponse);
      appendChatMessage("assistant", "Failed to parse OpenRouter response. Check console for details.");
      return;
    }

    if (!Array.isArray(parsedVerses) || parsedVerses.length === 0) {
      appendChatMessage("assistant", "No Bible verses found in the image.");
      if (unparseable.length > 0) {
        appendChatMessage("assistant", "Unparseable lines:\n" + unparseable.join("\n"));
      }
      return;
    }

    extractedVersesData = parsedVerses;
    renderExtractedVerses(parsedVerses);
    appendChatMessage("assistant", `Found ${parsedVerses.length} verse(s). Review and add to slides below.`);
    if (unparseable.length > 0) {
        appendChatMessage("assistant", "Unparseable lines (please add manually):\n" + unparseable.join("\n"));
    }
  } catch (error) {
    appendChatMessage("assistant", `Error: ${error.message}`);
    console.error("OpenRouter API Error:", error);
  }
}

function extractOpenRouterText(data) {
  if (!data || !Array.isArray(data.choices) || data.choices.length === 0) return "";
  const message = data.choices[0] && data.choices[0].message ? data.choices[0].message.content : "";
  if (!message) return "";
  return String(message).trim().replace(/```json/g, "").replace(/```/g, "").trim();
}

function extractGroqText(data) {
  if (!data || !Array.isArray(data.choices) || data.choices.length === 0) return "";
  const message = data.choices[0] && data.choices[0].message ? data.choices[0].message.content : "";
  if (!message) return "";
  return String(message).trim().replace(/```json/g, "").replace(/```/g, "").trim();
}

function isGroqVisionModel(modelName) {
  if (!modelName) return false;
  return String(modelName).toLowerCase().includes("vision");
}

function renderExtractedVerses(verses) {
  const history = document.getElementById("ai-chat-history");
  if (!history) return;

  const wrapper = document.createElement("div");
  wrapper.className = "ai-chat-row assistant";

  const bubble = document.createElement("div");
  bubble.className = "ai-chat-bubble assistant";
  bubble.style.width = "100%"; // Give it full width for the UI

  const clForm = document.createElement("div");
  clForm.style.display = "flex";
  clForm.style.flexDirection = "column";
  clForm.style.gap = "6px";
  clForm.style.marginBottom = "12px";
  clForm.style.maxHeight = "200px";
  clForm.style.overflowY = "auto";

  const checkboxes = [];
  verses.forEach((v, index) => {
    const item = document.createElement("div");
    item.className = "ai-check-item";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.id = `ai-inline-cb-${Date.now()}-${index}`;
    cb.checked = true;

    const label = document.createElement("label");
    label.htmlFor = cb.id;
    label.textContent = `${v.book} ${v.chapter}:${v.verse}`;

    item.appendChild(cb);
    item.appendChild(label);
    clForm.appendChild(item);
    checkboxes.push({ cb, verse: v });
  });

  const btn = document.createElement("button");
  btn.textContent = "Add Selected to Slides";
  btn.style.width = "100%";
  btn.style.background = "#22c55e";
  btn.style.color = "#18181b";
  btn.style.border = "none";
  btn.style.padding = "10px";
  btn.style.borderRadius = "6px";
  btn.style.cursor = "pointer";
  btn.style.fontFamily = "'DM Mono', monospace";
  btn.style.fontWeight = "600";
  btn.style.transition = "0.2s";

  btn.onclick = () => {
    let addedCount = 0;
    checkboxes.forEach((c) => {
      if (c.cb.checked) {
        const added = addVerseToMain(c.verse.book, c.verse.chapter, c.verse.verse);
        if (added) addedCount++;
      }
    });
    appendChatMessage("assistant", `Added ${addedCount} verse(s) to the main slides.`);
    btn.textContent = "Added!";
    btn.disabled = true;
    btn.style.background = "#3f3f46";
    btn.style.color = "#a1a1aa";
    btn.style.cursor = "not-allowed";
  };

  bubble.appendChild(clForm);
  bubble.appendChild(btn);
  wrapper.appendChild(bubble);
  history.appendChild(wrapper);
  history.scrollTop = history.scrollHeight;
}

// Reuse the existing verse searching behavior from app.js to add it to the main slide.
// We need to fetch the verse text. The system already has bible_content.js with bibleData object.
// We will look up the verse manually.
function addSelectedVersesToMain() {
  // Deprecated globally: Checkboxes and Add buttons are now generated inline in the chat history.
  closeExtractVersesModal();
}

// Function to find the verse text in bibleData and add to main slide
function addVerseToMain(bookName, chapter, verse) {
  // Check if bibleData exists (from bible_content.js)
  if (typeof bibleData === 'undefined') {
    console.error("bibleData is not loaded");
    return false;
  }
  
  // Try to find the book in bibleData. Usually the book name inside bibleData might include English or full Tamil.
  // The bibleData structure inside bible_content.js usually is an array of objects.
  // We may need to search by regex or directly if it matches tightly.
  let targetBook = null;
  // Let's iterate bibleData
  for (let bi = 0; bi < bibleData.length; bi++) {
    const b = bibleData[bi];
    // Compare tamil name roughly.
    // Sometimes it's exactly the same, sometimes it has variations.
    if (b.BookName.trim() === bookName.trim() || b.BookName.includes(bookName.trim()) || bookName.trim().includes(b.BookName.trim())) {
        targetBook = b;
        break;
    }
  }
  
  if (!targetBook) {
      console.warn(`Book not found for: ${bookName}`);
      return false;
  }
  
  // Find the exact chapter (1-indexed based on how data is structured. Usually b.Chapter is array)
  // Check if chapters are arrays of arrays or what they look like
  const chapterData = targetBook.Chapter[chapter]; 
  // wait, targetBook.Chapter could be undefined if it is 0 indexed. Let's assume 1-based logic normally used in this app.
  // Looking at app.js, the logic expects `book.Chapter[chapter][verse]`.
  
  let verseText = "";
  try {
      verseText = targetBook.Chapter[chapter][verse];
  } catch(e) {
      console.warn(`Verse not found: ${bookName} ${chapter}:${verse}`);
  }
  
  if (!verseText) {
      console.warn(`Verse text empty: ${bookName} ${chapter}:${verse}`);
      return false;
  }
  
  // Found the verse. Now, we want to create a slide directly.
  // Let's use the format similar to app.js addAsSlide()
  // Since we are separated, let's create the slide object and append it.
  const theId = 'bs-' + Date.now() + Math.random().toString(36).substr(2, 5);
  
  // Need to append to `slides` array which is global in app.js
  if (typeof slides === 'undefined') {
      console.error("slides array not found");
      return false;
  }
  
  const newItem = {
      id: theId,
      type: 'bible',
      title: `${targetBook.BookName} ${chapter}:${verse}`,
      subtitle: '',
      content: verseText,
      theme: currentTheme || 'theme-1' // app.js has currentTheme, fallback 'theme-1'
  };
  slides.push(newItem);
  
  // We call some methods from app.js to reflect the change
  if (typeof renderSlides === 'function') {
      renderSlides();
      scheduleSave();
  }
  
  return true;
}

initAIVerseAssistant();
