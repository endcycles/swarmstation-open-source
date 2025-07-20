/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  
  theme: {
    extend: {
      colors: {
        // Base colors
        'primary': '#667eea',
        'secondary': '#111111',
        'tertiary': '#1a1a1a',
        
        // Original colors
        'gray-dark': '#0a0a0a',
        'gray-medium': '#1a1a1a',
        'gray-light': '#e5e5e5',
        'purple-gradient-start': '#667eea',
        'purple-gradient-end': '#764ba2',
        'emerald-green': '#10b981',
        'blue-accent': '#3b82f6',
        'gray-text': '#999',
        'green-status': '#48bb78',
        'red-status': '#ff3b30',
        'yellow-status': '#ffcc00',
        'orange-status': '#ffc107',
        
        // Additional colors for consistency
        'error': '#ff6b6b',
        'border': {
          'primary': 'rgba(255, 255, 255, 0.1)',
          'secondary': 'rgba(255, 255, 255, 0.2)',
          'active': '#667eea',
        }
      },
      zIndex: {
        '1000': '1000',
        '2000': '2000',
      }
    },
  },
  plugins: [],
}