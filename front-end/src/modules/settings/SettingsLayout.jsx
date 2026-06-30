import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, Navigate, useLocation } from 'react-router-dom';
import PageWrapper from '../../components/ui/PageWrapper';
import ContentContainer from '../../components/ui/ContentContainer';
import { getUserRole } from '../../api/auth';
import { getConfig } from '../../api/setup';

const SettingsLayout = () => {
    const location = useLocation();
    const role = getUserRole();
    const [config, setConfig] = useState(null);

    useEffect(() => {
        getConfig().then(setConfig);
    }, []);

    if (role !== 'admin') {
        return <Navigate to="/dashboard" replace />;
    }

    // Redirect to default tab if exactly on /settings
    if (location.pathname === '/settings' || location.pathname === '/settings/') {
        return <Navigate to="/settings/users" replace />;
    }

    const tabs = [
        { path: '/settings/users', label: 'Users' },
    ];

    // Only show Allowed Clients if we are in Server mode
    if (config?.mode === 'server') {
        tabs.push({ path: '/settings/clients', label: 'Allowed Clients' });
    }

    return (
        <PageWrapper title="Settings">
            <ContentContainer scroll="auto">
                <div className="tabs-container">
                    {tabs.map((tab) => (
                        <NavLink
                            key={tab.path}
                            to={tab.path}
                            className={({ isActive }) => `tab-btn ${isActive ? 'active' : ''}`}
                        >
                            {tab.label}
                        </NavLink>
                    ))}
                </div>

                <div className="module-content">
                    <Outlet />
                </div>
            </ContentContainer>
        </PageWrapper>
    );
};

export default SettingsLayout;
