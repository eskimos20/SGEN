import { useState, useEffect } from 'react';
import { getItemsForDate, buildDateStr } from '../utils/calendarDayItems';

// Custom hook for calendar mobile navigation functionality
export const useCalendarMobileNavigation = (currentDate, activities, events, pendingEvents, setCurrentDate) => {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640);
  const [currentMobileDate, setCurrentMobileDate] = useState(() => {
    const today = new Date();
    return {
      day: today.getDate(),
      month: today.getMonth(),
      year: today.getFullYear()
    };
  });

  // Update mobile state on window resize
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 640);
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Update mobile date when main calendar date changes (but preserve the current day)
  useEffect(() => {
    if (isMobile) {
      setCurrentMobileDate(prev => ({
        day: prev.day, // Keep the current day
        month: currentDate.getMonth(),
        year: currentDate.getFullYear()
      }));
    }
  }, [currentDate, isMobile]);
  
  const navigateMobileDay = (direction, exactDate = null) => {
    setCurrentMobileDate(prev => {
      let newDate;
      if (exactDate) {
        newDate = new Date(exactDate.year, exactDate.month, exactDate.day);
      } else {
        newDate = new Date(prev.year, prev.month, prev.day);
        newDate.setDate(newDate.getDate() + direction);
      }
      
      // Check if month changed
      const monthChanged = newDate.getMonth() !== prev.month || newDate.getFullYear() !== prev.year;
      
      const newMobileDate = {
        day: newDate.getDate(),
        month: newDate.getMonth(),
        year: newDate.getFullYear()
      };
      
      // If month changed and we have setCurrentDate function, update the main calendar too
      if (monthChanged && setCurrentDate) {
        const newMonthDate = new Date(newDate.getFullYear(), newDate.getMonth(), 1);
        setCurrentDate(newMonthDate);
      }
      
      return newMobileDate;
    });
  };
  
  const getMobileDayItems = () => {
    if (!isMobile) return [];
    const dateStr = buildDateStr(currentMobileDate.year, currentMobileDate.month, currentMobileDate.day);
    return getItemsForDate(dateStr, activities, events, pendingEvents);
  };

  return {
    isMobile,
    currentMobileDate,
    navigateMobileDay,
    getMobileDayItems
  };
};
