import React, { useState } from 'react'
import WeekView from './components/WeekView'
import DayView from './components/DayView'
import StatsPage from './components/StatsPage'
import './App.css'

function App() {
  const [currentView, setCurrentView] = useState('day')

  const renderView = () => {
    switch (currentView) {
      case 'week':
        return <WeekView />
      case 'day':
        return <DayView />
      case 'stats':
        return <StatsPage />
      default:
        return <WeekView />
    }
  }

  return (
    <div className="App">
      <div className="container">
        <header className="header">
          <h1>🐕 Прогулки с собакой</h1>
          <p>Учёт прогулок между Андреем и Ирой</p>
        </header>
        
        <nav className="nav">
          <button 
            className={currentView === 'week' ? 'active' : ''}
            onClick={() => setCurrentView('week')}
          >
            Неделя
          </button>
          <button 
            className={currentView === 'day' ? 'active' : ''}
            onClick={() => setCurrentView('day')}
          >
            День
          </button>
          <button 
            className={currentView === 'stats' ? 'active' : ''}
            onClick={() => setCurrentView('stats')}
          >
            Статистика
          </button>
        </nav>

        <main>
          {renderView()}
        </main>
      </div>
    </div>
  )
}

export default App