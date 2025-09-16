import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';


import Home from './Home';
import CardList from './CardList.js';
import AkcentAnalyticsDashboard, { AkcentBackfillPage } from './experimental/AkcentAnalyticsDashboard.js';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/card-list" element={<CardList />} />
        <Route path="/analytics" element={<AkcentAnalyticsDashboard />} />
        <Route path="/experimental-fill" element={<AkcentBackfillPage />} />

      </Routes>
    </Router>
  );
}

export default App;