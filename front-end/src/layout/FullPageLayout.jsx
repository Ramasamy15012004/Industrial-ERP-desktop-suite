import React from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { isAuthenticated } from '../api/auth';

const FullPageLayout = () => {
    const authed = isAuthenticated();

    if (!authed) {
        return <Navigate to="/login" replace />;
    }

    return (
        <div className="fullpage-layout">
            <main className="page-content">
                <Outlet />
            </main>
        </div>
    );
};

export default FullPageLayout;
