import React, { useState } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { isAuthenticated } from '../api/auth';

const Layout = () => {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const authed = isAuthenticated();

    if (!authed) {
        return <Navigate to="/login" replace />;
    }

    return (
        <div className="app-layout">
            <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

            <div className="main-content">
                <Topbar onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
                <main className="page-content">
                    <Outlet />
                </main>
            </div>
        </div>
    );
};

export default Layout;
