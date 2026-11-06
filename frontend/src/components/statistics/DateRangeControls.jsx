import React from 'react';
import { Loader2, Download, Bot, CheckCircle, Copy } from 'lucide-react';

/**
 * Date-range picker + action buttons (Fetch Data / AI Analyze / Copy Data)
 * for the Statistics page. Presentational only — all state lives in the page.
 */
const DateRangeControls = ({
  dateRangeRef,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  isFetching,
  setIsFetching,
  shouldScrollRef,
  fetchData,
  data,
  hasOpenAIConfig,
  analyzing,
  setShowAIModal,
  copyDataToClipboard,
  copied,
}) => (
  <div ref={dateRangeRef} className="scroll-mt-20 bg-white rounded-xl sm:shadow-sm border border-gray-200 p-3 sm:p-6">
    <div className="grid grid-cols-2 gap-2 sm:gap-3 sm:flex sm:flex-wrap sm:items-end sm:gap-4 mb-3 sm:mb-4">
      <div>
        <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">Start Date</label>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="w-full px-1 sm:px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white text-xs sm:text-base sm:input"
          style={{ minHeight: '40px', colorScheme: 'light' }}
        />
      </div>
      <div>
        <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">End Date</label>
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="w-full px-1 sm:px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white text-xs sm:text-base sm:input"
          style={{ minHeight: '40px', colorScheme: 'light' }}
        />
      </div>
    </div>
    <div className="flex flex-wrap gap-2 sm:gap-4">
      <button
        onClick={async () => { setIsFetching(true); shouldScrollRef.current = true; await fetchData(); setIsFetching(false); }}
        disabled={isFetching}
        className="btn btn-primary bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 flex items-center gap-2 disabled:opacity-100 disabled:cursor-not-allowed"
      >
        {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        {isFetching ? 'Fetching...' : 'Fetch Data'}
      </button>
      {data && hasOpenAIConfig && (
        <button
          onClick={() => setShowAIModal(true)}
          disabled={analyzing}
          className="btn btn-primary bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 flex items-center gap-2"
        >
          {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
          AI Analyze
        </button>
      )}
      {data && !hasOpenAIConfig && (
        <button
          onClick={copyDataToClipboard}
          disabled={copied}
          className="btn btn-primary bg-green-600 hover:bg-green-700 flex items-center gap-2"
        >
          {copied ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Copied!' : 'Copy Data'}
        </button>
      )}
    </div>
  </div>
);

export default React.memo(DateRangeControls);
