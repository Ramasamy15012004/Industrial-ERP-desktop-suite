import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Package, Briefcase, FileText, Settings, CircleHelp, X } from 'lucide-react';
import { getUserRole } from '../api/auth';

const Sidebar = ({ isOpen, onClose }) => {
    const role = getUserRole();
    const navItems = [
        { path: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
        { path: '/inventory', label: 'Inventory', icon: <Package size={20} /> },
        { path: '/jobs', label: 'Jobs & Production', icon: <Briefcase size={20} /> },
        { path: '/reports', label: 'Reports', icon: <FileText size={20} /> },
        { path: '/settings', label: 'Settings', icon: <Settings size={20} /> },
        { path: '/help', label: 'Help', icon: <CircleHelp size={20} /> },
    ].filter((item) => {
        if (item.path === '/dashboard') return true;
        if (item.path === '/help') return true;
        if (item.path === '/inventory') return role === 'admin' || role === 'inventory' || role === 'audit';
        if (item.path === '/jobs') return role === 'admin' || role === 'production' || role === 'audit';
        if (item.path === '/reports') return role === 'admin' || role === 'production' || role === 'inventory' || role === 'audit';
        if (item.path === '/settings') return role === 'admin';
        return false;
    });

    return (
        <>
            {/* Mobile Overlay */}
            <div
                className={`sidebar-overlay ${isOpen ? 'block' : 'hidden'}`}
                onClick={onClose}
            />

            <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
                <div className="sidebar-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Package size={24} style={{ color: 'var(--primary-600, #3b82f6)' }} />
                        <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#1e293b' }}>PIMS</span>
                    </div>

                    <button
                        className="icon-button sidebar-close"
                        onClick={onClose}
                        aria-label="Close sidebar"
                    >
                        <X size={24} />
                    </button>
                </div>

                <nav className="sidebar-nav">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                            onClick={() => {
                                if (window.innerWidth < 768) onClose();
                            }}
                        >
                            {item.icon}
                            <span>{item.label}</span>
                        </NavLink>
                    ))}
                </nav>
            </aside>
        </>
    );
};

export default Sidebar;
