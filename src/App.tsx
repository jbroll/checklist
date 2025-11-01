import { Dashboard } from './components/Dashboard';
import { JazzProvider } from './lib/jazz';

function App() {
  return (
    <JazzProvider>
      <div className="min-h-screen bg-neutral-50">
        <Dashboard />
      </div>
    </JazzProvider>
  );
}

export default App;
