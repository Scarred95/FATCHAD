import { Route, Routes } from 'react-router-dom';
import { DecksIndex } from './pages/DecksIndex';
import { DeckDetail } from './pages/DeckDetail';
import { CardEditor } from './pages/CardEditor';
import { GraphView } from './pages/GraphView';

export default function App() {
  return (
    <div className="min-h-full">
      <div className="max-w-7xl mx-auto p-4 sm:p-6">
        <Routes>
          <Route path="/" element={<DecksIndex />} />
          <Route path="/decks/:name" element={<DeckDetail />} />
          <Route path="/graph" element={<GraphView />} />
          <Route path="/cards/new" element={<CardEditor mode="new" />} />
          <Route path="/cards/:id" element={<CardEditor mode="edit" />} />
        </Routes>
      </div>
    </div>
  );
}
