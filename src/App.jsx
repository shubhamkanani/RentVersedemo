import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThirdwebProvider } from 'thirdweb/react';
import { ThemeProvider } from './context/ThemeContext';
import { WalletAuthProvider } from './context/WalletAuthContext';
import Navbar from './components/layout/Navbar';
import Footer from './components/layout/Footer';
import Home from './pages/Home';
import Properties from './pages/Properties';
import PropertyDetail from './pages/PropertyDetail';
import Property3D from './pages/Property3D';
import About from './pages/About';
import FAQ from './pages/FAQ';
import Privacy from './pages/Privacy';
import Blog from './pages/Blog';
import BlogPost from './pages/BlogPost';
import NotFound from './pages/NotFound';

function App() {
  return (
    <ThemeProvider>
      <ThirdwebProvider>
        {/* Must sit inside ThirdwebProvider — the login session is derived from
            the connected account, so it needs useActiveAccount in scope. */}
        <WalletAuthProvider>
          <Router>
            <div className="min-h-screen flex flex-col dark:bg-secondary-900">
              <Navbar />
              <main className="flex-grow">
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/properties" element={<Properties />} />
                  <Route path="/properties/:id" element={<PropertyDetail />} />
                  <Route path="/property-3d" element={<Property3D />} />
                  <Route path="/about" element={<About />} />
                  <Route path="/privacy" element={<Privacy />} />
                  <Route path="/faq" element={<FAQ />} />
                  <Route path="/blog" element={<Blog />} />
                  <Route path="/blog/:slug" element={<BlogPost />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </main>
              <Footer />
            </div>
          </Router>
        </WalletAuthProvider>
      </ThirdwebProvider>
    </ThemeProvider>
  );
}

export default App;
