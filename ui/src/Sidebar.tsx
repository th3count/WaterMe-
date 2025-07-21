import { NavLink } from 'react-router-dom';
import { useState, useEffect } from 'react';

export default function Sidebar() {
  const [healthStatus, setHealthStatus] = useState<'good' | 'warning' | 'error'>('good');

  useEffect(() => {
    // Fetch health status
    const fetchHealthStatus = async () => {
      try {
        const [locationsRes, mapRes, alertsRes] = await Promise.all([
          fetch('http://127.0.0.1:5000/api/locations'),
          fetch('http://127.0.0.1:5000/api/map'),
          fetch('http://127.0.0.1:5000/api/health/alerts')
        ]);

        const [locations, map, alertsData] = await Promise.all([
          locationsRes.json(),
          mapRes.json(),
          alertsRes.json()
        ]);

        // Check for orphaned plants
        const orphanedPlants = Object.entries(map).filter(([instanceId, plant]: [string, any]) => {
          if (!plant || !plant.location_id) return false;
          return !locations.some((loc: any) => loc.location_id === plant.location_id);
        });

        // Check if any orphaned plants are not ignored
        const ignoredAlerts = new Set(
          alertsData.ignored_alerts?.map((alert: any) => `${alert.alert_type}-${alert.alert_id}`) || []
        );

        const activeOrphanedPlants = orphanedPlants.filter(([instanceId, plant]: [string, any]) => 
          !ignoredAlerts.has(`orphaned_plant-${instanceId}`)
        );

        if (activeOrphanedPlants.length > 0) {
          setHealthStatus('warning');
        } else {
          setHealthStatus('good');
        }
      } catch (error) {
        console.error('Error fetching health status:', error);
        setHealthStatus('good'); // Default to good on error
      }
    };

    fetchHealthStatus();
    // Refresh health status every 30 seconds
    const interval = setInterval(fetchHealthStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const getHealthIcon = () => {
    switch (healthStatus) {
      case 'good':
        return <span style={{ float: 'right', marginRight: '8px', color: '#4CAF50' }}>✓</span>;
      case 'warning':
        return <span style={{ float: 'right', marginRight: '8px', color: '#FF9800', fontWeight: 'bold' }}>!</span>;
      case 'error':
        return <span style={{ float: 'right', marginRight: '8px', color: '#F44336', fontWeight: 'bold' }}>✕</span>;
      default:
        return <span style={{ float: 'right', marginRight: '8px' }}>✓</span>;
    }
  };

  return (
    <div style={{
      width: 150,
      minHeight: '100vh',
      background: '#181f2a',
      color: '#fff',
      padding: '1.2rem 0.5rem',
      position: 'fixed',
      top: 0,
      left: 0,
      boxShadow: '2px 0 8px rgba(24,31,42,0.12)',
      fontFamily: 'Inter, Segoe UI, Arial, sans-serif'
    }}>
      <h2 style={{ color: '#00bcd4', marginBottom: 18, fontWeight: 800, fontSize: 20, letterSpacing: 1, textAlign: 'center' }}>WaterMe!</h2>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <NavLink to="/" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Overview</NavLink>
        <NavLink to="/plants" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Plants</NavLink>
        <NavLink to="/zones" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Zones</NavLink>
        <NavLink to="/locations" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Locations</NavLink>
        <NavLink to="/library" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Library</NavLink>
        <NavLink to="/health" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
          Health
          {getHealthIcon()}
        </NavLink>
        <NavLink to="/logs" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Logs</NavLink>
        <NavLink to="/settings" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Settings</NavLink>
      </nav>
      <style>{`
        .nav-link {
          color: #f4f4f4;
          text-decoration: none;
          font-size: 15px;
          font-weight: 600;
          margin-bottom: 2px;
          padding: 4px 0 4px 12px;
          border-radius: 4px;
          transition: background 0.15s, color 0.15s;
          text-align: left;
          font-family: inherit;
        }
        .nav-link.active, .nav-link:hover {
          background: #00bcd4;
          color: #181f2a;
        }
      `}</style>
    </div>
  );
} 