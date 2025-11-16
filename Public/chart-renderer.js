/**
 * This script runs *only* on chart.html.
 * It reads the chart data from sessionStorage and renders the chart.
 * All chart-related functions from main.js have been moved here.
 */

// --- SVG Graphics Loading ---
// Load SVG graphics from external files
let footerSVG = '';

/**
 * Loads horizontal SVG graphics for the chart decorations.
 * These SVGs are used for the footer stripe pattern.
 * @async
 * @returns {Promise<void>}
 */
async function loadSVGs() {
  try {
    const footerResponse = await fetch('/horizontal-stripe.svg');
    footerSVG = await footerResponse.text();

    console.log('SVG graphics loaded successfully');
  } catch (error) {
    console.error('Error loading SVG graphics:', error);
  }
}

// -------------------------------------------------------------------
// --- SAFE DOM ACCESS HELPER FUNCTIONS ---
// -------------------------------------------------------------------

/**
 * DOM ACCESS STANDARDS:
 *
 * 1. Cleanup operations (can silently fail):
 *    - Use optional chaining: element?.remove()
 *    - Example: document.getElementById('old-modal')?.remove();
 *
 * 2. Required operations (must check and handle):
 *    - Use safeGetElement() or safeQuerySelector()
 *    - Check for null and return/handle appropriately
 *    - Example:
 *      const modal = safeGetElement('required-modal', 'functionName');
 *      if (!modal) return; // or handle error
 *
 * 3. When to use each pattern:
 *    - Optional chaining: Removing old elements, optional features
 *    - Explicit checks: Core functionality, user interactions
 */

/**
 * Safely gets DOM element by ID with error logging
 * @param {string} id - Element ID
 * @param {string} context - Context for error message (function name)
 * @returns {HTMLElement|null}
 */
function safeGetElement(id, context = '') {
  const element = document.getElementById(id);
  if (!element) {
    console.error(`Element not found: #${id}${context ? ` (in ${context})` : ''}`);
  }
  return element;
}

/**
 * Safely queries DOM element with error logging
 * @param {string} selector - CSS selector
 * @param {string} context - Context for error message (function name)
 * @returns {HTMLElement|null}
 */
function safeQuerySelector(selector, context = '') {
  const element = document.querySelector(selector);
  if (!element) {
    console.error(`Element not found: ${selector}${context ? ` (in ${context})` : ''}`);
  }
  return element;
}

document.addEventListener("DOMContentLoaded", async () => {
  let ganttData = null;

  // Safely parse ganttData from sessionStorage with error handling
  try {
    const stored = sessionStorage.getItem('ganttData');
    if (stored) {
      ganttData = JSON.parse(stored);

      // Validate structure
      if (!ganttData || typeof ganttData !== 'object') {
        throw new Error('Invalid gantt data structure');
      }

      if (!Array.isArray(ganttData.data) || !ganttData.timeColumns) {
        throw new Error('Gantt data missing required fields');
      }
    }
  } catch (error) {
    console.error('Failed to parse ganttData from sessionStorage:', error);
    // Clear corrupted data
    sessionStorage.removeItem('ganttData');
    ganttData = null;
  }

  if (ganttData) {
    // Load SVG graphics before rendering the chart
    await loadSVGs();
    setupChart(ganttData);
  } else {
    document.getElementById('chart-root').innerHTML =
      '<h1 style="font-family: sans-serif; text-align: center; margin-top: 40px;">No chart data found. Please close this tab and try generating the chart again.</h1>';
  }
});

/**
 * Dynamically builds and renders the Gantt chart.
 * Creates the chart structure including title, grid, timeline, tasks, legend,
 * decorative SVG elements, and export functionality.
 * @param {Object} ganttData - The chart configuration and data
 * @param {string} ganttData.title - Chart title
 * @param {string[]} ganttData.timeColumns - Array of time period labels (e.g., ["Q1 2025", "Q2 2025"])
 * @param {Array<Object>} ganttData.data - Array of task/swimlane objects
 * @param {Array<Object>} [ganttData.legend] - Optional legend items
 * @returns {void}
 */
function setupChart(ganttData) {
  
  // MODIFICATION: Render into '#chart-root' instead of '#chart-output'
  const container = document.getElementById('chart-root');
  if (!container) {
    console.error("Could not find chart container!");
    return;
  }
  
  // Clear container
  container.innerHTML = '';

  // Create the main chart wrapper
  const chartWrapper = document.createElement('div');
  chartWrapper.id = 'gantt-chart-container'; // ID for styling & export
  
  // -------------------------------------------------------------------
  // --- NEW: Add BIP Logo ---
  // -------------------------------------------------------------------
  // We add this *before* the title so it's part of the wrapper.
  // We use inline styles for absolute positioning.
  const logoImg = document.createElement('img');
  logoImg.src = '/bip_logo.png';
  logoImg.alt = 'BIP Logo';
  
  // Apply inline styles for positioning
  logoImg.style.position = 'absolute';
  logoImg.style.top = '30px'; // Moved down from 28px for better alignment
  logoImg.style.right = '24px'; // Padding from right edge
  logoImg.style.height = '40px'; // Slightly smaller than form logo
  logoImg.style.width = 'auto';
  logoImg.style.zIndex = '10'; // Ensure it's above the grid
  
  chartWrapper.appendChild(logoImg);
  // --- END: Add BIP Logo ---

  // Add Title (from data)
  const titleEl = document.createElement('div');
  titleEl.className = 'gantt-title';
  titleEl.textContent = ganttData.title;
  chartWrapper.appendChild(titleEl);

  // Create Grid
  const gridEl = document.createElement('div');
  gridEl.className = 'gantt-grid';

  // --- Dynamic Grid Columns ---
  const numCols = ganttData.timeColumns.length;
  // --- MODIFICATION: Increased min-width to 400px for better text readability ---
  gridEl.style.gridTemplateColumns = `minmax(400px, 1.5fr) repeat(${numCols}, 1fr)`;

  // --- Create Header Row ---
  const headerLabel = document.createElement('div');
  headerLabel.className = 'gantt-header gantt-header-label';
  gridEl.appendChild(headerLabel);
  
  for (const colName of ganttData.timeColumns) {
    const headerCell = document.createElement('div');
    headerCell.className = 'gantt-header';
    headerCell.textContent = colName;
    gridEl.appendChild(headerCell);
  }

  // --- Create Data Rows ---
  for (const row of ganttData.data) {
    const isSwimlane = row.isSwimlane;
    
    // 1. Create Label Cell
    const labelEl = document.createElement('div');
    labelEl.className = `gantt-row-label ${isSwimlane ? 'swimlane' : 'task'}`;
    labelEl.textContent = row.title;
    gridEl.appendChild(labelEl);
    
    // 2. Create Bar Area
    const barAreaEl = document.createElement('div');
    barAreaEl.className = `gantt-bar-area ${isSwimlane ? 'swimlane' : 'task'}`;
    barAreaEl.style.gridColumn = `2 / span ${numCols}`;
    barAreaEl.style.gridTemplateColumns = `repeat(${numCols}, 1fr)`;
    
    // Add empty cells for vertical grid lines
    for (let i = 1; i <= numCols; i++) {
      const cell = document.createElement('span');
      cell.setAttribute('data-col', i);
      barAreaEl.appendChild(cell);
    }

    // 3. Add the bar (if it's a task and has bar data)
    if (!isSwimlane && row.bar && row.bar.startCol != null) {
      const bar = row.bar;
      
      const barEl = document.createElement('div');
      barEl.className = 'gantt-bar';
      barEl.setAttribute('data-color', bar.color || 'default');
      barEl.style.gridColumn = `${bar.startCol} / ${bar.endCol}`;
      
      barAreaEl.appendChild(barEl);

      // --- NEW: Add click listener for analysis ---
      // We make both the label and the bar area clickable
      const taskIdentifier = { taskName: row.title, entity: row.entity };
      labelEl.addEventListener('click', () => showAnalysisModal(taskIdentifier));
      barAreaEl.addEventListener('click', () => showAnalysisModal(taskIdentifier));
      labelEl.style.cursor = 'pointer';
      barAreaEl.style.cursor = 'pointer';
    }
    
    gridEl.appendChild(barAreaEl);
  }

  chartWrapper.appendChild(gridEl);
  
  // --- NEW: Add Legend (if it exists) ---
  if (ganttData.legend && ganttData.legend.length > 0) {
    const legendEl = buildLegend(ganttData.legend);
    chartWrapper.appendChild(legendEl);
  }
  // --- END: Add Legend ---

  // --- NEW: Add Footer SVG ---
  const encodedFooterSVG = encodeURIComponent(footerSVG.replace(/(\r\n|\n|\r)/gm, ""));

  const footerSvgEl = document.createElement('div');
  footerSvgEl.className = 'gantt-footer-svg';

  // Apply all styles inline
  footerSvgEl.style.height = '30px';
  footerSvgEl.style.backgroundImage = `url("data:image/svg+xml,${encodedFooterSVG}")`;
  footerSvgEl.style.backgroundRepeat = 'repeat-x';
  footerSvgEl.style.backgroundSize = 'auto 30px';

  chartWrapper.appendChild(footerSvgEl);
  // --- END: Add Footer SVG ---

  // --- Add Export Button ---
  const exportContainer = document.createElement('div');
  exportContainer.className = 'export-container';
  const exportBtn = document.createElement('button');
  exportBtn.id = 'export-png-btn';
  exportBtn.className = 'export-button';
  exportBtn.textContent = 'Export as PNG';
  exportContainer.appendChild(exportBtn);
  
  // Add the chart and button to the page
  container.appendChild(chartWrapper);
  container.appendChild(exportContainer);

  // Add Export Functionality
  addExportListener();

  // --- NEW: Add "Today" Line ---
  const today = new Date('2025-11-14T12:00:00');
  addTodayLine(gridEl, ganttData.timeColumns, today);
}

/**
 * Adds export functionality to the chart.
 * Finds the export button and chart container, then adds a click listener
 * that uses html2canvas to generate and download a PNG image of the chart.
 * @returns {void}
 */
function addExportListener() {
  const exportBtn = document.getElementById('export-png-btn');
  const chartContainer = document.getElementById('gantt-chart-container');

  if (!exportBtn || !chartContainer) {
    console.warn("Export button or chart container not found.");
    return;
  }

  exportBtn.addEventListener('click', () => {
    exportBtn.textContent = 'Exporting...';
    exportBtn.disabled = true;

    html2canvas(chartContainer, { 
      useCORS: true,
      logging: false,
      scale: 2 // Render at 2x resolution
    }).then(canvas => {
      const link = document.createElement('a');
      link.download = 'gantt-chart.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
      
      exportBtn.textContent = 'Export as PNG';
      exportBtn.disabled = false;
    }).catch(err => {
      console.error("Error exporting canvas:", err);
      exportBtn.textContent = 'Export as PNG';
      exportBtn.disabled = false;
      alert("Error exporting chart. See console for details.");
    });
  });
}

// -------------------------------------------------------------------
// --- "TODAY" LINE HELPER FUNCTIONS ---
// -------------------------------------------------------------------

/**
 * Calculates and adds the "Today" line to the grid.
 * The line is positioned based on the current date's location within the timeline.
 * Supports Year, Quarter, Month, and Week granularities.
 * @param {HTMLElement} gridEl - The main .gantt-grid element
 * @param {string[]} timeColumns - The array of time columns (e.g., ["Q1 2025", "Q2 2025"])
 * @param {Date} today - The current date object
 * @returns {void}
 */
function addTodayLine(gridEl, timeColumns, today) {
  const position = findTodayColumnPosition(today, timeColumns);
  if (!position) return; // Today is not in the chart's range

  try {
    // Get element dimensions for calculation
    const labelCol = gridEl.querySelector('.gantt-header-label');
    const headerRow = gridEl.querySelector('.gantt-header');
    
    if (!labelCol || !headerRow) return;

    // --- MODIFICATION: We now need to get the grid's parent offset, not the label col ---
    // const labelColWidth = labelCol.offsetWidth;
    const gridRect = gridEl.getBoundingClientRect();
    const containerRect = gridEl.parentElement.getBoundingClientRect();
    // Calculate the left margin (which should be 30px)
    const leftMargin = gridRect.left - containerRect.left;

    const headerHeight = headerRow.offsetHeight;
    // We use the grid's *client* width, which excludes margins
    const gridClientWidth = gridEl.clientWidth; 
    
    // Find label col width from within the grid
    const labelColWidth = labelCol.offsetWidth;

    // Calculate pixel position
    const timeColAreaWidth = gridClientWidth - labelColWidth;
    const oneColWidth = timeColAreaWidth / timeColumns.length;
    const todayOffset = (position.index + position.percentage) * oneColWidth;
    
    // The line's left position is relative to the grid element
    const lineLeftPosition = labelColWidth + todayOffset;

    // Create and append the line
    const todayLine = document.createElement('div');
    todayLine.className = 'gantt-today-line';
    todayLine.style.top = `${headerHeight}px`;
    todayLine.style.bottom = '0';
    todayLine.style.left = `${lineLeftPosition}px`;
    
    gridEl.appendChild(todayLine);

  } catch (e) {
    console.error("Error calculating 'Today' line position:", e);
  }
}

/**
 * Finds the column index and percentage offset for today's date.
 * Analyzes the time column format to determine granularity (Year/Quarter/Month/Week),
 * then calculates where today falls within that column.
 * @param {Date} today - The current date
 * @param {string[]} timeColumns - The array of time columns (determines format)
 * @returns {{index: number, percentage: number}|null} Position object with column index and percentage offset, or null if not found
 */
function findTodayColumnPosition(today, timeColumns) {
  if (timeColumns.length === 0) return null;

  const firstCol = timeColumns[0];
  const todayYear = today.getFullYear();

  // 1. Check for Year columns (e.g., "2025")
  if (/^\d{4}$/.test(firstCol)) {
    const todayYearStr = todayYear.toString();
    const index = timeColumns.indexOf(todayYearStr);
    if (index === -1) return null;

    const startOfYear = new Date(todayYear, 0, 1);
    const endOfYear = new Date(todayYear, 11, 31);
    const dayOfYear = (today - startOfYear) / (1000 * 60 * 60 * 24);
    const totalDays = (endOfYear - startOfYear) / (1000 * 60 * 60 * 24);
    const percentage = dayOfYear / totalDays;
    return { index, percentage };
  }

  // 2. Check for Quarter columns (e.g., "Q4 2025")
  if (/^Q[1-4]\s\d{4}$/.test(firstCol)) {
    const month = today.getMonth();
    const quarter = Math.floor(month / 3) + 1;
    const todayQuarterStr = `Q${quarter} ${todayYear}`;
    const index = timeColumns.indexOf(todayQuarterStr);
    if (index === -1) return null;

    const quarterStartMonth = (quarter - 1) * 3;
    const startOfQuarter = new Date(todayYear, quarterStartMonth, 1);
    const endOfQuarter = new Date(todayYear, quarterStartMonth + 3, 0); // 0th day of next month
    const dayInQuarter = (today - startOfQuarter) / (1000 * 60 * 60 * 24);
    const totalDays = (endOfQuarter - startOfQuarter) / (1000 * 60 * 60 * 24);
    const percentage = dayInQuarter / totalDays;
    return { index, percentage };
  }

  // 3. Check for Month columns (e.g., "Nov 2025")
  if (/^[A-Za-z]{3}\s\d{4}$/.test(firstCol)) {
    const todayMonthStr = today.toLocaleString('en-US', { month: 'short' }) + ` ${todayYear}`;
    const index = timeColumns.indexOf(todayMonthStr);
    if (index === -1) return null;

    const startOfMonth = new Date(todayYear, today.getMonth(), 1);
    const endOfMonth = new Date(todayYear, today.getMonth() + 1, 0);
    const dayInMonth = today.getDate(); // 14th
    const totalDays = endOfMonth.getDate(); // 30 for Nov
    const percentage = dayInMonth / totalDays;
    return { index, percentage };
  }
  
  // 4. Check for Week columns (e.g., "W46 2025")
  if (/^W\d{1,2}\s\d{4}$/.test(firstCol)) {
    const todayWeekStr = `W${getWeek(today)} ${todayYear}`;
    const index = timeColumns.indexOf(todayWeekStr);
    if (index === -1) return null;

    const dayOfWeek = today.getDay(); // 0 (Sun) - 6 (Sat)
    const percentage = (dayOfWeek + 0.5) / 7; // Place line in middle of the day
    return { index, percentage };
  }

  return null; // Unknown format
}

/**
 * Gets the ISO 8601 week number for a given date.
 * ISO 8601 weeks start on Monday and the first week of the year
 * contains the first Thursday of the year.
 * @param {Date} date - The date to get the week number for
 * @returns {number} The ISO 8601 week number (1-53)
 */
function getWeek(date) {
  var d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  var dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
  return Math.ceil((((d - yearStart) / 86400000) + 1)/7);
}


// -------------------------------------------------------------------
// --- "ON-DEMAND" ANALYSIS MODAL ---
// -------------------------------------------------------------------

/**
 * Creates and displays a modal with detailed task analysis.
 * Fetches analysis data from the /get-task-analysis endpoint and renders it
 * in a modal dialog. Includes facts, assumptions, dates, status, and a chat interface.
 * @async
 * @param {Object} taskIdentifier - Task identification object
 * @param {string} taskIdentifier.taskName - Name of the task to analyze
 * @param {string} taskIdentifier.entity - Entity/organization associated with the task
 * @returns {Promise<void>}
 */
async function showAnalysisModal(taskIdentifier) {
  // 1. Remove any old modal
  document.getElementById('analysis-modal')?.remove();

  // 2. Create modal structure
  const modalOverlay = document.createElement('div');
  modalOverlay.id = 'analysis-modal';
  modalOverlay.className = 'modal-overlay';
  
  const modalContent = document.createElement('div');
  modalContent.className = 'modal-content';
  
  modalContent.innerHTML = `
    <div class="modal-header">
      <h3 class="modal-title">Analyzing...</h3>
      <button class="modal-close" id="modal-close-btn">&times;</button>
    </div>
    <div class="modal-body" id="modal-body-content">
      <div class="modal-spinner"></div>
    </div>
  `;
  
  modalOverlay.appendChild(modalContent);
  document.body.appendChild(modalOverlay);

  // 3. Add close listeners
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) {
      modalOverlay?.remove(); // Optional chaining for cleanup
    }
  });
  const closeBtn = document.getElementById('modal-close-btn');
  closeBtn?.addEventListener('click', () => {
    modalOverlay?.remove(); // Optional chaining for cleanup
  });

  // 4. Fetch the analysis data
  try {
    const response = await fetch('/get-task-analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(taskIdentifier)
    });

    if (!response.ok) {
      // Handle non-JSON error responses gracefully
      let errorMessage = `Server error: ${response.status}`;
      try {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const err = await response.json();
          errorMessage = err.error || errorMessage;
        } else {
          const text = await response.text();
          errorMessage = text.substring(0, 200) || errorMessage; // Limit error length
        }
      } catch (parseError) {
        console.error('Failed to parse error response:', parseError);
      }
      throw new Error(errorMessage);
    }

    const analysis = await response.json();
    const modalBody = safeGetElement('modal-body-content', 'showAnalysisModal');
    if (!modalBody) return;

    // 5. Populate the modal with the analysis (sanitized to prevent XSS)
    const modalTitle = safeQuerySelector('.modal-title', 'showAnalysisModal');
    if (modalTitle) modalTitle.textContent = analysis.taskName;
    const analysisHTML = `
      ${buildAnalysisSection('Status', `<span class="status-pill status-${analysis.status.replace(/\s+/g, '-').toLowerCase()}">${DOMPurify.sanitize(analysis.status)}</span>`)}
      ${buildAnalysisSection('Dates', `${DOMPurify.sanitize(analysis.startDate || 'N/A')} to ${DOMPurify.sanitize(analysis.endDate || 'N/A')}`)}
      ${buildAnalysisList('Facts', analysis.facts, 'fact', 'source')}
      ${buildAnalysisList('Assumptions', analysis.assumptions, 'assumption', 'source')}
      ${buildAnalysisSection('Summary', analysis.summary)}
      ${buildAnalysisSection('Rationale / Hurdles', analysis.rationale)}
    `;
    modalBody.innerHTML = DOMPurify.sanitize(analysisHTML);

    // 6. --- NEW: Add the chat interface ---
    const chatContainer = document.createElement('div');
    chatContainer.className = 'chat-container';
    chatContainer.innerHTML = `
      <h4 class="chat-title">Ask a follow-up</h4>
      <div class="chat-history" id="chat-history"></div>
      <form class="chat-form" id="chat-form">
        <input type="text" id="chat-input" class="chat-input" placeholder="Ask about this task..." autocomplete="off">
        <button type="submit" class="chat-send-btn">Send</button>
      </form>
    `;
    modalBody.appendChild(chatContainer);

    // 7. --- NEW: Add chat form listener ---
    const chatForm = document.getElementById('chat-form');
    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handleAskQuestion(taskIdentifier);
    });

  } catch (error) {
    console.error("Error fetching analysis:", error);
    // Use DOM methods to prevent XSS in error display
    const modalBody = document.getElementById('modal-body-content');
    if (modalBody) {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'modal-error';
      errorDiv.textContent = `Failed to load analysis: ${error.message}`;
      modalBody.innerHTML = '';
      modalBody.appendChild(errorDiv);
    }
  }
}

/**
 * Handles the "Send" button click in the chat modal.
 * Sends the user's question to the /ask-question endpoint and displays
 * the response in the chat history. Implements proper error handling and
 * state management (disables UI during request, clears input only on success).
 * @async
 * @param {Object} taskIdentifier - Task identification object
 * @param {string} taskIdentifier.taskName - Name of the task
 * @param {string} taskIdentifier.entity - Entity associated with the task
 * @returns {Promise<void>}
 */
async function handleAskQuestion(taskIdentifier) {
  const input = safeGetElement('chat-input', 'handleAskQuestion');
  const sendBtn = safeQuerySelector('.chat-send-btn', 'handleAskQuestion');

  if (!input || !sendBtn) return;

  const question = input.value.trim();
  if (!question) return;

  // 1. Disable UI (but don't clear input yet - only clear on success)
  input.disabled = true;
  sendBtn.disabled = true;

  // 2. Add user question to history
  addMessageToHistory(question, 'user');

  // 3. Add spinner for LLM response
  const spinnerId = `spinner-${Date.now()}`;
  addMessageToHistory('<div class="chat-spinner"></div>', 'llm', spinnerId);

  try {
    // 4. Call the /ask-question endpoint
    const response = await fetch('/ask-question', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...taskIdentifier,
        question: question
      })
    });

    if (!response.ok) {
      // Handle non-JSON error responses gracefully
      let errorMessage = `Server error: ${response.status}`;
      try {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const err = await response.json();
          errorMessage = err.error || errorMessage;
        } else {
          const text = await response.text();
          errorMessage = text.substring(0, 200) || errorMessage; // Limit error length
        }
      } catch (parseError) {
        console.error('Failed to parse error response:', parseError);
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();

    // 5. Replace spinner with answer (sanitized to prevent XSS)
    const spinnerEl = document.getElementById(spinnerId);
    if (spinnerEl) {
      spinnerEl.innerHTML = DOMPurify.sanitize(data.answer); // Sanitize LLM response
    } else {
      addMessageToHistory(data.answer, 'llm'); // Fallback
    }

    // 6. Clear input only on success
    if (input) {
      input.value = '';
    }
    
  } catch (error) {
    console.error("Error asking question:", error);
    // Replace spinner with error (using DOM methods to prevent XSS)
    const spinnerEl = document.getElementById(spinnerId);
    const errorSpan = document.createElement('span');
    errorSpan.style.color = '#BA3930';
    errorSpan.textContent = `Error: ${error.message}`;
    if (spinnerEl) {
      spinnerEl.innerHTML = ''; // Clear spinner
      spinnerEl.appendChild(errorSpan);
    } else {
      // Fallback - add error as new message
      const errorDiv = document.createElement('div');
      errorDiv.className = 'chat-message chat-message-llm';
      errorDiv.appendChild(errorSpan);
      const history = document.getElementById('chat-history');
      if (history) history.appendChild(errorDiv);
    }
  } finally {
    // 6. Re-enable UI (with null checks)
    if (input) {
      input.disabled = false;
      input.focus();
    }
    if (sendBtn) {
      sendBtn.disabled = false;
    }
  }
}

/**
 * Helper to add a message to the chat history UI.
 * Sanitizes content based on message type to prevent XSS.
 */
function addMessageToHistory(content, type, id = null) {
  const history = document.getElementById('chat-history');
  if (!history) return; // Safety check

  const msg = document.createElement('div');
  msg.className = `chat-message chat-message-${type}`;
  if (id) {
    msg.id = id;
  }

  // Sanitize content based on sender type
  if (type === 'llm') {
    // LLM responses may have legitimate formatting, use DOMPurify
    msg.innerHTML = DOMPurify.sanitize(content);
  } else if (type === 'user') {
    // User messages should never have HTML
    msg.textContent = content;
  } else {
    // For other types (like spinner HTML), trust it if it comes from our code
    msg.innerHTML = content;
  }

  history.appendChild(msg);
  // Scroll to bottom
  history.scrollTop = history.scrollHeight;
}


// -------------------------------------------------------------------
// --- MODAL & LEGEND BUILDER HELPER FUNCTIONS ---
// -------------------------------------------------------------------

/**
 * Validates that a URL is safe (only http/https protocols).
 * Prevents javascript: and other dangerous protocols.
 * @param {string} url - The URL to validate
 * @returns {boolean} - True if URL is safe
 */
function isSafeUrl(url) {
  try {
    const parsed = new URL(url);
    // Only allow http and https protocols
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch (e) {
    return false; // Invalid URL
  }
}

/**
 * Builds an HTML string for a <section> in the modal.
 * Skips if content is null or empty.
 * Content is sanitized to prevent XSS.
 */
function buildAnalysisSection(title, content) {
  if (!content) return '';
  // Sanitize title and content
  const safeTitle = DOMPurify.sanitize(title);
  const safeContent = DOMPurify.sanitize(content);
  return `
    <div class="analysis-section">
      <h4>${safeTitle}</h4>
      <p>${safeContent}</p>
    </div>
  `;
}

/**
 * Builds an HTML string for a <ul> of facts/assumptions.
 * Skips if list is null or empty.
 * Content is sanitized to prevent XSS.
 */
function buildAnalysisList(title, items, itemKey, sourceKey) {
  if (!items || items.length === 0) return '';

  const listItems = items.map(item => {
    const itemText = DOMPurify.sanitize(item[itemKey] || '');
    let sourceText = DOMPurify.sanitize(item[sourceKey] || 'Source not available');

    // If URL is present, validate and make the source a link
    if (item.url && isSafeUrl(item.url)) {
      const safeUrl = DOMPurify.sanitize(item.url);
      sourceText = `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${sourceText}</a>`;
    }

    return `
      <li>
        <p>${itemText}</p>
        <p class="source">${sourceText}</p>
      </li>
    `;
  }).join('');

  const safeTitle = DOMPurify.sanitize(title);
  return `
    <div class="analysis-section">
      <h4>${safeTitle}</h4>
      <ul class="analysis-list">
        ${listItems}
      </ul>
    </div>
  `;
}

/**
 * Builds the HTML legend element for the Gantt chart.
 * Creates a visual legend showing color-coded categories and their meanings.
 * @param {Array<Object>} legendData - Array of legend items
 * @param {string} legendData[].color - Color identifier for the legend item
 * @param {string} legendData[].label - Text label for the legend item
 * @returns {HTMLElement} The constructed legend DOM element
 */
function buildLegend(legendData) {
  const legendContainer = document.createElement('div');
  legendContainer.className = 'gantt-legend';

  const title = document.createElement('h3');
  title.className = 'legend-title';
  title.textContent = 'Legend';
  legendContainer.appendChild(title);
  
  const list = document.createElement('div');
  list.className = 'legend-list';
  
  for (const item of legendData) {
    const itemEl = document.createElement('div');
    itemEl.className = 'legend-item';
    
    const colorBox = document.createElement('div');
    colorBox.className = 'legend-color-box';
    colorBox.setAttribute('data-color', item.color);
    
    const label = document.createElement('span');
    label.className = 'legend-label';
    label.textContent = item.label;
    
    itemEl.appendChild(colorBox);
    itemEl.appendChild(label);
    list.appendChild(itemEl);
  }
  
  legendContainer.appendChild(list);
  return legendContainer;
}