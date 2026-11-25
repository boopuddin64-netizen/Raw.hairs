import { StoreProvider, useStore } from './context/StoreContext.tsx';
import { Navbar } from './components/Navbar.tsx';
import { MobileNav } from './components/MobileNav.tsx';
import { BagDrawer } from './components/BagDrawer.tsx';
import { Footer } from './components/Footer.tsx';
import { HomePage } from './pages/HomePage.tsx';
import { ShopPage } from './pages/ShopPage.tsx';
import { ProductPage } from './pages/ProductPage.tsx';
import { ServicesPage } from './pages/ServicesPage.tsx';
import { CheckoutPage } from './pages/CheckoutPage.tsx';
import { QuotationPage } from './pages/QuotationPage.tsx';
import { TrackOrderPage } from './pages/TrackOrderPage.tsx';
import { HelpPage } from './pages/HelpPage.tsx';
import { AccountPage } from './pages/AccountPage.tsx';
import { DispatchPage } from './pages/DispatchPage.tsx';
import { AdminPage } from './pages/AdminPage.tsx';

function AppShell() {
  const { route } = useStore();

  const renderPage = () => {
    switch (route.page) {
      case 'home':
        return <HomePage />;
      case 'shop':
        return <ShopPage initialCategory={route.category} />;
      case 'product':
        return <ProductPage slug={route.slug} />;
      case 'services':
        return <ServicesPage />;
      case 'checkout':
        return <CheckoutPage payRef={route.payRef} />;
      case 'quote':
        return <QuotationPage />;
      case 'track':
        return <TrackOrderPage />;
      case 'help':
        return <HelpPage topic={route.topic} />;
      case 'account':
        return <AccountPage />;
      case 'dispatch':
        return <DispatchPage />;
      case 'admin':
        return <AdminPage />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg)] text-[var(--ink)]">
      <Navbar />
      <main className="flex-1">{renderPage()}</main>
      <Footer />
      <MobileNav />
      <BagDrawer />
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <AppShell />
    </StoreProvider>
  );
}
