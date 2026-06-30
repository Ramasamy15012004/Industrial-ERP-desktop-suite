import React from 'react';
import { NavLink, Outlet, Navigate, useLocation } from 'react-router-dom';
import PageWrapper from '../../components/ui/PageWrapper';
import ContentContainer from '../../components/ui/ContentContainer';
import { getUserRole } from '../../api/auth';

const InventoryLayout = () => {
    const location = useLocation();
    const role = getUserRole();

    if (!(role === 'admin' || role === 'inventory' || role === 'audit')) {
        return <Navigate to="/dashboard" replace />;
    }

    // Redirect to default tab if exactly on /inventory
    if (location.pathname === '/inventory' || location.pathname === '/inventory/') {
        return <Navigate to="/inventory/transactions" replace />;
    }

    const tabs = [
        { path: '/inventory/transactions', label: 'Inventory Dashboard' },
        { path: '/inventory/low-stock', label: 'Stock Transaction' },
        { path: '/inventory/shortage-qty', label: 'Shortage QTY' },
        { path: '/inventory/purchase', label: 'Purchase Entry' },
    ];

    if (role === 'admin') {
        tabs.push({ path: '/inventory/materials', label: 'Material Master' });
    }

    return (
        <PageWrapper title="Inventory Management">
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

export default InventoryLayout;
