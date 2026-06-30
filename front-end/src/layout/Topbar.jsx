import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, User, LogOut } from 'lucide-react';
import axios from 'axios';
import { clearAuthSession, getStoredUser } from '../api/auth';

const API = 'http://localhost:8000';

const Topbar = ({ onMenuClick }) => {
    const navigate = useNavigate();
    const user = getStoredUser() || { name: 'Guest' };

    const handleLogout = async () => {
        try {
            await axios.post(`${API}/auth/logout`);
        } catch {
            // ignore
        }

        clearAuthSession();
        navigate('/login');
    };

    return (
        <header className="topbar">
            <div className="flex items-center gap-4">
                <button className="icon-button topbar-menu-toggle" onClick={onMenuClick} aria-label="Open menu">
                    <Menu size={24} />
                </button>
                <h1 className="topbar-title">Production & Inventory Management System</h1>
            </div>

            <div className="flex items-center gap-4">
                <div className="topbar-user">
                    <User size={20} />
                    <span>
                        {user.name}
                        {user.role ? <span className="text-muted"> ({user.role})</span> : null}
                    </span>
                </div>
                <button className="icon-button danger" onClick={handleLogout} title="Logout" aria-label="Logout">
                    <LogOut size={20} />
                </button>
            </div>
        </header>
    );
};

export default Topbar;
