import React from 'react';
import { ChevronDown, ChevronUp, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { getEventEmoji, getEventInfo } from '../../utils/sportTypeUtils';

const EventsList = ({ data, expandedEvents, toggleEventDetails }) => {
  if (!data?.events) {
    return (
      <div className="card-mobile">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Calendar className="h-5 w-5 text-blue-600" />
          Events
        </h2>
        <div className="text-gray-500 text-center py-4">
          No events data available
        </div>
      </div>
    );
  }

  if (data.events.length === 0) {
    return (
      <div className="card-mobile">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Calendar className="h-5 w-5 text-blue-600" />
          Events (0)
        </h2>
        <div className="text-gray-500 text-center py-4">
          No events found in the selected date range
        </div>
      </div>
    );
  }

  const sortedEvents = [...data.events].sort((a, b) => 
    new Date(b.start_date_local || b.start_date) - new Date(a.start_date_local || a.start_date)
  );

  return (
    <div className="card-mobile">
      <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <Calendar className="h-5 w-5 text-blue-600" />
        Events ({data.events.length})
      </h2>
      <div className="space-y-2">
        {sortedEvents.map((event) => {
          const eventInfo = getEventInfo(event.category);
          const isExpanded = expandedEvents.has(event.id);
          
          return (
            <div key={event.id} className="border border-gray-200 rounded-lg overflow-hidden">
              <button
                onClick={() => toggleEventDetails(event.id)}
                className="w-full px-4 py-3 flex items-center justify-between transition-colors hover:bg-gray-50"
              >
                <div className="flex items-center gap-4">
                  <div className="text-2xl">{eventInfo.emoji}</div>
                  <div className="text-left">
                    <div className="font-medium text-gray-900">
                      {event.name || eventInfo.name}
                    </div>
                    <div className="text-sm text-gray-500">
                      {event.start_date_local || event.start_date 
                        ? format(new Date(event.start_date_local || event.start_date), 'MMM d, yyyy') 
                        : 'Unknown date'} • {event.category || 'Event'}
                    </div>
                    {event.description && (
                      <div className="text-sm text-gray-600 mt-1 line-clamp-2">
                        {event.description}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right text-sm">
                    <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      eventInfo.color === 'red' ? 'bg-red-100 text-red-800' :
                      eventInfo.color === 'blue' ? 'bg-blue-100 text-blue-800' :
                      eventInfo.color === 'purple' ? 'bg-purple-100 text-purple-800' :
                      eventInfo.color === 'orange' ? 'bg-orange-100 text-orange-800' :
                      eventInfo.color === 'green' ? 'bg-green-100 text-green-800' :
                      eventInfo.color === 'yellow' ? 'bg-yellow-100 text-yellow-800' :
                      eventInfo.color === 'pink' ? 'bg-pink-100 text-pink-800' :
                      eventInfo.color === 'cyan' ? 'bg-cyan-100 text-cyan-800' :
                      eventInfo.color === 'amber' ? 'bg-amber-100 text-amber-800' :
                      eventInfo.color === 'indigo' ? 'bg-indigo-100 text-indigo-800' :
                      eventInfo.color === 'gray' ? 'bg-gray-100 text-gray-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {eventInfo.name}
                    </div>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="h-5 w-5 text-gray-400" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-gray-400" />
                  )}
                </div>
              </button>
              
              {isExpanded && (
                <div className="px-4 pb-4 bg-gray-50 border-t border-gray-200">
                  <div className="pt-4 space-y-2">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="font-medium text-gray-700">Type:</span>
                        <span className="ml-2 text-gray-600">{event.category || 'Unknown'}</span>
                      </div>
                      <div>
                        <span className="font-medium text-gray-700">Date:</span>
                        <span className="ml-2 text-gray-600">
                          {event.start_date_local || event.start_date 
                            ? format(new Date(event.start_date_local || event.start_date), 'yyyy-MM-dd') 
                            : 'Unknown'}
                        </span>
                      </div>
                      {event.duration && (
                        <div>
                          <span className="font-medium text-gray-700">Duration:</span>
                          <span className="ml-2 text-gray-600">{event.duration}s</span>
                        </div>
                      )}
                      {event.icu_training_load && (
                        <div>
                          <span className="font-medium text-gray-700">Load:</span>
                          <span className="ml-2 text-gray-600">{Math.round(event.icu_training_load)} TSS</span>
                        </div>
                      )}
                    </div>
                    {event.description && (
                      <div>
                        <span className="font-medium text-gray-700 text-sm">Description:</span>
                        <p className="mt-1 text-sm text-gray-600 whitespace-pre-wrap">
                          {event.description}
                        </p>
                      </div>
                    )}
                    {event.workout_doc && (
                      <div>
                        <span className="font-medium text-gray-700 text-sm">Workout Details:</span>
                        <div className="mt-1 text-sm text-gray-600">
                          <p>Duration: {event.workout_doc.duration || 'N/A'} minutes</p>
                          <p>Steps: {event.workout_doc.steps?.length || 0}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default React.memo(EventsList);
