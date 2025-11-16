/**
 * This script runs *only* on chart.html.
 * It reads the chart data from sessionStorage and renders the chart.
 * All chart-related functions from main.js have been moved here.
 */

// --- SVG Graphics Loading ---
// Load SVG graphics from external files
let verticalSVG = '';
let footerSVG = '';

async function loadSVGs() {
  try {
    const [verticalResponse, footerResponse] = await Promise.all([
      fetch('/vertical-stripe.svg'),
      fetch('/horizontal-stripe.svg')
    ]);

    verticalSVG = await verticalResponse.text();
    footerSVG = await footerResponse.text();

    console.log('SVG graphics loaded successfully');
  } catch (error) {
    console.error('Error loading SVG graphics:', error);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const ganttData = JSON.parse(sessionStorage.getItem('ganttData'));

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
 * The Dynamic Renderer.
 * This function builds the chart *based* on* the data from sessionStorage.
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

  // --- NEW: Add Vertical SVG ---
  // Since viewBox causes issues, use the working approach: remove viewBox and insert directly
  const verticalSVGNoViewBox = verticalSVG
    .replace(/viewBox="[^"]*"/, '')
    .replace(/width="[^"]*"/, '')
    .replace(/height="[^"]*"/, '')
    .replace(/overflow="[^"]*"/, '');

  // Create wrapper with white background
  const verticalSvgWrapper = document.createElement('div');
  verticalSvgWrapper.className = 'gantt-vertical-svg';
  verticalSvgWrapper.style.position = 'absolute';
  verticalSvgWrapper.style.left = '0';
  verticalSvgWrapper.style.top = '0';
  verticalSvgWrapper.style.width = '30px';
  verticalSvgWrapper.style.height = '100%';
  verticalSvgWrapper.style.zIndex = '5';
  verticalSvgWrapper.style.backgroundColor = 'white';
  verticalSvgWrapper.style.overflow = 'hidden';

  // Insert SVG - we'll clone it multiple times to create repeating effect
  verticalSvgWrapper.innerHTML = verticalSVGNoViewBox;

  const svgElement = verticalSvgWrapper.querySelector('svg');
  if (svgElement) {
    svgElement.style.display = 'block';
    svgElement.style.width = '30px';
    svgElement.style.height = 'auto';

    // Clone the SVG multiple times to fill the height
    // SVG natural height is ~1280px based on paths, clone enough to cover tall charts
    for (let i = 0; i < 10; i++) {  // 10 copies should cover most charts
      const clone = svgElement.cloneNode(true);
      verticalSvgWrapper.appendChild(clone);
    }

    console.log('Vertical SVG inserted with 10 clones for repeating pattern');
  }

  chartWrapper.appendChild(verticalSvgWrapper);
  // --- END: Add Vertical SVG ---
  
  // Add Title (from data)
  const titleEl = document.createElement('div');
  titleEl.className = 'gantt-title';
  titleEl.textContent = ganttData.title;
  // Add left margin to make room for vertical SVG
  titleEl.style.marginLeft = '30px';
  chartWrapper.appendChild(titleEl);

  // Create Grid
  const gridEl = document.createElement('div');
  gridEl.className = 'gantt-grid';
  // Add left margin to make room for vertical SVG
  gridEl.style.marginLeft = '30px';
  gridEl.style.width = 'calc(100% - 30px)';

  // --- Dynamic Grid Columns ---
  const numCols = ganttData.timeColumns.length;
  // --- MODIFICATION: Increased min-width from 220px to 330px (50% wider) ---
  gridEl.style.gridTemplateColumns = `minmax(330px, 1.5fr) repeat(${numCols}, 1fr)`;

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

  // --- VERTICAL SVG BORDER BLOCK REMOVED ---


  // --- NEW: Add Footer SVG ---
  // --- FIX: Reverting to the original, fully inline-styled implementation ---
  const encodedFooterSVG = encodeURIComponent(footerSVG.replace(/(\r\n|\n|\r)/gm, ""));

  const footerSvgEl = document.createElement('div');
  footerSvgEl.className = 'gantt-footer-svg';

  // Apply all styles inline, just like the original code
  footerSvgEl.style.height = '30px';
  footerSvgEl.style.backgroundImage = `url("data:image/svg+xml,${encodedFooterSVG}")`;
  footerSvgEl.style.backgroundRepeat = 'repeat-x';
  footerSvgEl.style.backgroundSize = 'auto 30px';

  // Also add the new styles for margin/width
  footerSvgEl.style.width = 'calc(100% - 30px)';
  footerSvgEl.style.marginLeft = '30px';

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
 * Finds the export button and chart container, then
 * adds a click listener to trigger html2canvas.
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
 * @param {HTMLElement} gridEl - The main .gantt-grid element.
 * @param {string[]} timeColumns - The array of time columns (e.g., ["Q1 2025", ...]).
 * @param {Date} today - The current date object.
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
 * @param {Date} today - The current date.
 * @param {string[]} timeColumns - The array of time columns.
 * @returns {{index: number, percentage: number} | null}
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
 * @param {Date} date - The date.
S @returns {number} The week number.
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
 * Creates and shows the analysis modal.
 * Fetches data from the new /get-task-analysis endpoint.
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
      <div classs="modal-spinner"></div>
    </div>
  `;
  
  modalOverlay.appendChild(modalContent);
  document.body.appendChild(modalOverlay);

  // 3. Add close listeners
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) {
      modalOverlay.remove();
    }
  });
  document.getElementById('modal-close-btn').addEventListener('click', () => {
    modalOverlay.remove();
  });

  // 4. Fetch the analysis data
  try {
    const response = await fetch('/get-task-analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(taskIdentifier)
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || "Server error");
    }

    const analysis = await response.json();
    const modalBody = document.getElementById('modal-body-content');

    // 5. Populate the modal with the analysis
    document.querySelector('.modal-title').textContent = analysis.taskName;
    modalBody.innerHTML = `
      ${buildAnalysisSection('Status', `<span class="status-pill status-${analysis.status.replace(/\s+/g, '-').toLowerCase()}">${analysis.status}</span>`)}
      ${buildAnalysisSection('Dates', `${analysis.startDate || 'N/A'} to ${analysis.endDate || 'N/A'}`)}
      ${buildAnalysisList('Facts', analysis.facts, 'fact', 'source')}
      ${buildAnalysisList('Assumptions', analysis.assumptions, 'assumption', 'source')}
      ${buildAnalysisSection('Summary', analysis.summary)}
      ${buildAnalysisSection('Rationale / Hurdles', analysis.rationale)}
    `;

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
    // --- FIX: Correctly close the innerHTML string ---
    document.getElementById('modal-body-content').innerHTML = `<div class="modal-error">Failed to load analysis: ${error.message}</div>`;
  }
} // --- FIX: Added closing brace for showAnalysisModal ---

/**
 * Handles the "Send" button click in the chat modal.
 */
async function handleAskQuestion(taskIdentifier) {
  const input = document.getElementById('chat-input');
  const history = document.getElementById('chat-history');
  const sendBtn = document.querySelector('.chat-send-btn');
  const question = input.value.trim();

  if (!question) return;

  // 1. Disable UI
  input.value = '';
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
      const err = await response.json();
      throw new Error(err.error || "Server error");
    }

    const data = await response.json();
    
    // 5. Replace spinner with answer
    const spinnerEl = document.getElementById(spinnerId);
    if (spinnerEl) {
      spinnerEl.innerHTML = data.answer; // Replace spinner content with answer
    } else {
      addMessageToHistory(data.answer, 'llm'); // Fallback
    }
    
  } catch (error) {
    console.error("Error asking question:", error);
    // Replace spinner with error
    const spinnerEl = document.getElementById(spinnerId);
    const errorMsg = `<span style="color: #BA3930;">Error: ${error.message}</span>`;
    if (spinnerEl) {
      spinnerEl.innerHTML = errorMsg;
    } else {
      addMessageToHistory(errorMsg, 'llm'); // Fallback
    }
  } finally {
    // 6. Re-enable UI
    input.disabled = false;
    sendBtn.disabled = false;
    input.focus();
  }
}

/**
 * Helper to add a message to the chat history UI.
 */
function addMessageToHistory(content, type, id = null) {
  const history = document.getElementById('chat-history');
  const msg = document.createElement('div');
  msg.className = `chat-message chat-message-${type}`;
  if (id) {
    msg.id = id;
  }
  msg.innerHTML = content;
  
  history.appendChild(msg);
  // Scroll to bottom
  history.scrollTop = history.scrollHeight;
}


// -------------------------------------------------------------------
// --- MODAL & LEGEND BUILDER HELPER FUNCTIONS ---
// -------------------------------------------------------------------

/**
 * Builds an HTML string for a <section> in the modal.
 * Skips if content is null or empty.
 */
function buildAnalysisSection(title, content) {
  if (!content) return '';
  return `
    <div class="analysis-section">
      <h4>${title}</h4>
      <p>${content}</p>
    </div>
  `;
}

/**
 * Builds an HTML string for a <ul> of facts/assumptions.
 * Skips if list is null or empty.
 */
function buildAnalysisList(title, items, itemKey, sourceKey) {
  if (!items || items.length === 0) return '';
  
  const listItems = items.map(item => {
    let sourceText = item[sourceKey] || 'Source not available';
    // If URL is present, make the source a link
    if (item.url) {
      sourceText = `<a href="${item.url}" target="_blank" rel="noopener noreferrer">${sourceText}</a>`;
    }
    
    return `
      <li>
        <p>${item[itemKey]}</p>
        <p class="source">${sourceText}</p>
      </li>
    `;
  }).join('');
  
  return `
    <div class="analysis-section">
      <h4>${title}</h4>
      <ul class="analysis-list">
        ${listItems}
      </ul>
    </div>
  `;
}

/**
 * Builds the HTML legend element.
 */
function buildLegend(legendData) {
  const legendContainer = document.createElement('div');
  legendContainer.className = 'gantt-legend';
  // Add left margin to make room for vertical SVG
  legendContainer.style.marginLeft = '30px';
  legendContainer.style.width = 'calc(100% - 30px)';

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