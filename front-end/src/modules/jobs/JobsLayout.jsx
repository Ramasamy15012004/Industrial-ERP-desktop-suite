import React from 'react';
import { NavLink, Outlet, Navigate, useLocation } from 'react-router-dom';
import PageWrapper from '../../components/ui/PageWrapper';
import ContentContainer from '../../components/ui/ContentContainer';
import { getUserRole } from '../../api/auth';

const JobsLayout = () => {
    const location = useLocation();
    const role = getUserRole();

    if (!(role === 'admin' || role === 'production' || role === 'audit')) {
        return <Navigate to="/dashboard" replace />;
    }

    // Redirect to default tab if exactly on /jobs
    if (location.pathname === '/jobs' || location.pathname === '/jobs/') {
        return <Navigate to="/jobs/details" replace />;
    }

    const tabs = [{ path: '/jobs/details', label: 'Job Details' }];

    if (role === 'admin' || role === 'production') {
        tabs.push({ path: '/jobs/production', label: 'Production Entry' });
    }

    if (role === 'admin' || role === 'production' || role === 'audit') {
        tabs.push({ path: '/jobs/completed', label: 'Completed Jobs' });
        tabs.push({ path: '/jobs/bom', label: 'BOM Setup' });
    }

    return (
        <PageWrapper title="Jobs & Production Management">
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

export default JobsLayout;
