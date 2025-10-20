"use client";

import { useEffect } from 'react';

export default function Popup({ isOpen, onClose, title, message, children, variant = 'default' }) {
  // Handle escape key to close popup
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      // Prevent body scroll when popup is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black bg-opacity-50 backdrop-blur-sm transition-opacity duration-300 popup-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />
      
      {/* Popup Content */}
      <div className={`relative rounded-2xl shadow-2xl border-2 p-8 max-w-md w-full mx-4 transform transition-all duration-300 scale-100 popup-enter ${
        variant === 'win' 
          ? 'bg-gradient-to-br from-yellow-100 to-orange-100 border-yellow-400' 
          : variant === 'lose'
          ? 'bg-gradient-to-br from-gray-100 to-blue-100 border-gray-400'
          : 'bg-white border-yellow-400'
      }`}>
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-yellow-400 rounded-full p-1"
          aria-label="Close popup"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Content */}
        <div className="text-center">
          {title && (
            <h2 className="text-3xl font-bold text-gray-800 mb-4">
              {title}
            </h2>
          )}
          
          {message && (
            <p className="text-lg text-gray-600 mb-6">
              {message}
            </p>
          )}
          
          {children}
        </div>
      </div>
    </div>
  );
}
