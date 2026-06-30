import React from 'react';
import { createHashRouter, Navigate } from 'react-router-dom';
import Layout from './layout/Layout';
import FullPageLayout from './layout/FullPageLayout';
import Login from './pages/Login';

// Dashboard
import Dashboard from './modules/dashboard/Dashboard';

// Jobs modules
import JobsLayout from './modules/jobs/JobsLayout';
import JobDetails from './modules/jobs/JobDetails';
import ProductionEntry from './modules/jobs/ProductionEntry';
import CompletedJobs from './modules/jobs/CompletedJobs';
import CreateJob from './modules/jobs/CreateJob';
import BOMSetup from './modules/jobs/BOMSetup';

// Inventory modules
import InventoryLayout from './modules/inventory/InventoryLayout';
import StockTransactions from './modules/inventory/StockTransactions';
import LowStock from './modules/inventory/LowStock';
import MaterialMaster from './modules/inventory/MaterialMaster';
import PurchaseEntry from './modules/inventory/PurchaseEntry';
import ShortageQty from './modules/inventory/ShortageQty';

// Others
import Reports from './modules/reports/Reports';
import SettingsLayout from './modules/settings/SettingsLayout';
import UserManagement from './modules/settings/UserManagement';
import AllowedClients from './modules/settings/AllowedClients';
import Help from './modules/help/Help';

const router = createHashRouter([
    {
        path: '/login',
        element: <Login />,
    },
    {
        path: '/help',
        element: <FullPageLayout />,
        children: [
            {
                index: true,
                element: <Help />,
            },
        ],
    },
    {
        path: '/',
        element: <Layout />,
        children: [
            {
                index: true,
                element: <Navigate to="/dashboard" replace />,
            },
            {
                path: 'dashboard',
                element: <Dashboard />,
            },
            {
                path: 'jobs',
                element: <JobsLayout />,
                children: [
                    { index: true, element: <Navigate to="details" replace /> },
                    { path: 'details', element: <JobDetails /> },
                    { path: 'production', element: <ProductionEntry /> },
                    { path: 'completed', element: <CompletedJobs /> },
                    { path: 'bom', element: <BOMSetup /> },
                    { path: 'create', element: <Navigate to="/jobs/details" replace /> },
                ],
            },
            {
                path: 'inventory',
                element: <InventoryLayout />,
                children: [
                    { index: true, element: <Navigate to="transactions" replace /> },
                    { path: 'transactions', element: <StockTransactions /> },
                    { path: 'low-stock', element: <LowStock /> },
                    { path: 'shortage-qty', element: <ShortageQty /> },
                    { path: 'materials', element: <MaterialMaster /> },
                    { path: 'purchase', element: <PurchaseEntry /> },
                    
                ],
            },
            {
                path: 'reports',
                element: <Reports />,
            },
            {
                path: 'settings',
                element: <SettingsLayout />,
                children: [
                    { index: true, element: <Navigate to="users" replace /> },
                    { path: 'products', element: <Navigate to="/settings/users" replace /> },
                    { path: 'users', element: <UserManagement /> },
                    { path: 'clients', element: <AllowedClients /> },
                ],
            },
        ],
    },
]);

export default router;
