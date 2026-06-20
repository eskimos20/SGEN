import { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { format } from 'date-fns';
import { Bot, GripHorizontal, Maximize2, Minimize2, X } from 'lucide-react';
import { useLockBodyScroll } from '../../utils/modalScrollLock';

const ChatWindow = ({
  showAIModal,
  isMinimized,
  isFloating,
  isDragging,
  chatPosition,
  chatMessages,
  analyzing,
  customPrompt,
  startDate,
  endDate,
  chatContainerRef,
  lastUserMessageRef,
  handleChatDragStart,
  setIsMinimized,
  setShowAIModal,
  setChatPosition,
  setIsFloating,
  setCustomPrompt,
  handleKeyPress,
  handleAIAnalyze
}) => {
  // Lock background scroll when AI modal is open (not minimized and visible)
  useLockBodyScroll(showAIModal && !isMinimized);
  
  const prevMessageCountRef = useRef(chatMessages.length);

  // Auto-scroll: when a new user message appears, scroll it to the top of the chat area.
  // When the AI response arrives, scroll so the user's question is at the top with the answer below.
  useEffect(() => {
    if (chatMessages.length > prevMessageCountRef.current) {
      const lastMessage = chatMessages[chatMessages.length - 1];
      if (lastMessage?.role === 'user' && lastUserMessageRef?.current) {
        // New user message: scroll it to the top of the visible area
        setTimeout(() => {
          lastUserMessageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 50);
      } else if (lastMessage?.role === 'assistant' && lastUserMessageRef?.current) {
        // AI response arrived: scroll so the user's question is at the top
        setTimeout(() => {
          lastUserMessageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 50);
      }
    }
    prevMessageCountRef.current = chatMessages.length;
  }, [chatMessages, lastUserMessageRef]);

  // Also scroll when analyzing starts (to show "AI is thinking...")
  useEffect(() => {
    if (analyzing && lastUserMessageRef?.current) {
      setTimeout(() => {
        lastUserMessageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    }
  }, [analyzing, lastUserMessageRef]);

  if (!showAIModal) return null;

  // Minimized View
  if (isMinimized) {
    return (
      <div 
        className="fixed bottom-4 right-4 z-50 bg-gradient-to-r from-blue-500 to-cyan-600 rounded-lg shadow-2xl flex items-center gap-3 px-4 py-3 cursor-pointer hover:shadow-3xl transition-shadow"
        onClick={() => setIsMinimized(false)}
      >
        <GripHorizontal className="h-5 w-5 text-white/60" />
        <span className="text-white font-semibold">AI Assistant</span>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); setIsMinimized(false); }}
            className="p-1.5 hover:bg-white/20 rounded transition-colors"
            title="Maximize"
          >
            <Maximize2 className="h-4 w-4 text-white" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setShowAIModal(false); }}
            className="p-1.5 hover:bg-white/20 rounded transition-colors"
            title="Close"
          >
            <X className="h-4 w-4 text-white" />
          </button>
        </div>
      </div>
    );
  }

  // Full View
  return (
    <div className={`fixed inset-0 ${isFloating ? '' : 'bg-black/50'} flex items-center justify-center z-50 p-0 sm:p-4 ${isFloating ? 'pointer-events-none' : ''}`}>
      <div 
        className={`bg-white rounded-t-2xl rounded-xl shadow-2xl max-w-none sm:max-w-6xl w-full h-[85vh] sm:h-[85vh] flex flex-col ${isFloating ? 'pointer-events-auto' : ''}`}
        style={isFloating ? {
          position: 'fixed',
          left: `calc(50% + ${chatPosition.x}px)`,
          top: `calc(50% + ${chatPosition.y}px)`,
          transform: 'translate(-50%, -50%)',
          maxWidth: '72rem',
          width: 'calc(100% - 2rem)'
        } : {}}
      >
        {/* Header - Draggable on desktop only */}
        <div 
          className={`p-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-blue-500 to-cyan-600 rounded-t-2xl sm:rounded-t-lg ${isDragging ? 'cursor-grabbing' : 'sm:cursor-grab'}`}
          onMouseDown={handleChatDragStart}
        >
          <div className="flex items-center gap-2">
            <GripHorizontal className="h-5 w-5 text-white/60" />
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Bot className="h-6 w-6 text-white" />
              AI Training Assistant
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {isFloating && (
              <button
                onClick={() => { setChatPosition({ x: 0, y: 0 }); setIsFloating(false); }}
                className="px-2 py-1 text-xs bg-white/20 hover:bg-white/30 rounded text-white transition-colors"
                title="Center window"
              >
                Center
              </button>
            )}
            <button
              onClick={() => setIsMinimized(true)}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              title="Minimize"
            >
              <Minimize2 className="h-5 w-5 text-white" />
            </button>
            <button
              onClick={() => setShowAIModal(false)}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              title="Close"
            >
              <X className="h-5 w-5 text-white" />
            </button>
          </div>
        </div>
        
        {/* Chat Messages (scrollable) */}
        <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {chatMessages.length === 0 && (
            <div className="text-center py-8">
              <Bot className="h-12 w-12 text-purple-300 mx-auto mb-3" />
              <p className="text-gray-500 mb-2">Ask me anything about your training data!</p>
              <p className="text-sm text-gray-400">
                Data period: {format(new Date(startDate), 'MMM d')} - {format(new Date(endDate), 'MMM d, yyyy')}
              </p>
            </div>
          )}
          
          {/* Render all messages in order */}
          {chatMessages.map((message, idx) => {
            // Find the index of the last user message
            const lastUserIdx = chatMessages.map((m, i) => m.role === 'user' ? i : -1).filter(i => i !== -1).pop();
            const isLastUserMessage = message.role === 'user' && idx === lastUserIdx;
            
            return (
              <div 
                key={idx} 
                ref={isLastUserMessage ? lastUserMessageRef : null}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`rounded-lg px-4 py-2 ${
                  message.role === 'user'
                    ? 'bg-blue-600 text-white max-w-[85%]'
                    : message.isError
                      ? 'bg-red-50 text-red-800 border border-red-200 max-w-full'
                      : 'bg-gray-100 text-gray-900 max-w-full'
                }`}>
                  {message.role === 'user' ? (
                    <div className="text-sm whitespace-pre-wrap">{message.content}</div>
                  ) : (
                    <div className="text-sm prose prose-sm max-w-none prose-headings:mt-4 prose-headings:mb-3 prose-h1:mb-3 prose-h2:mb-3 prose-h3:mb-3 prose-p:mt-2 prose-p:mb-2 prose-p:leading-relaxed prose-ul:my-2 prose-li:my-1 prose-li:leading-relaxed prose-strong:text-gray-900">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          
          {analyzing && (
            <div className="flex justify-start">
              <div className="bg-gray-100 rounded-lg px-4 py-2">
                <div className="flex items-center gap-2 text-gray-600">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
                  </div>
                  <span className="text-sm">AI is thinking...</span>
                </div>
              </div>
            </div>
          )}
        </div>
        
        {/* Input Area */}
        <div className="p-4 border-t border-gray-200">
          <div className="flex gap-2">
            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask a question about your training... (Press Enter to send, Shift+Enter for new line)"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
              style={{ fontSize: '16px' }}
              rows="2"
              disabled={analyzing}
            />
            <button
              onClick={handleAIAnalyze}
              disabled={!customPrompt.trim() || analyzing}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 self-end"
            >
              <Bot className="h-4 w-4" />
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatWindow;
