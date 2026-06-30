import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import FormContainer from '../components/ui/FormContainer';
import FormInput from '../components/ui/FormInput';
import PrimaryButton from '../components/ui/PrimaryButton';
import { setAuthSession } from '../api/auth';
import { resetConfig, getConfig } from '../api/setup';

const API = '';

function formatError(err) {
    const detail = err?.response?.data?.detail;
    if (!detail) return err?.message || 'An unexpected error occurred';
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) {
        return detail.map((d) => d.msg || JSON.stringify(d)).join(', ');
    }
    return JSON.stringify(detail);
}

const Login = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isClient, setIsClient] = useState(false);
    const navigate = useNavigate();

    React.useEffect(() => {
        getConfig().then(cfg => {
            if (cfg && cfg.mode === 'client') setIsClient(true);
        });
    }, []);

    const handleReset = async () => {
        if (!window.confirm("Are you sure you want to reset the server connection? This will wipe your local settings and allow you to re-run the setup wizard.")) return;
        try {
            await resetConfig();
            window.location.reload();
        } catch (err) {
            alert("Failed to reset: " + err.message);
        }
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');

        try {
            const res = await axios.post(`${API}/auth/login`, { username, password });
            const token = res.data?.access_token;
            const user = res.data?.user;

            if (!token || !user) throw new Error('Invalid login response');

            setAuthSession({
                token,
                user: {
                    id: user.id,
                    username: user.username,
                    full_name: user.full_name || user.username,
                    name: user.full_name || user.username,
                    role: user.role,
                },
            });

            navigate('/dashboard');
        } catch (err) {
            setError(formatError(err));
        }
    };

    return (
        <div className="login-container">
            <div className="login-box">
                <h2 className="login-title">Login</h2>
                {error && <div className="login-error form-error">{error}</div>}
                <form onSubmit={handleLogin}>
                    <FormContainer className="login-form">
                        <FormInput
                            label="Username"
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="admin / production / inventory / audit"
                        />
                        <FormInput
                            label="Password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="same as username as password for First time"
                        />
                        <div className="form-actions">
                            <PrimaryButton type="submit" className="w-full">
                                Sign In
                            </PrimaryButton>
                        </div>
                        {isClient && (
                            <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '13px' }}>
                                <button 
                                    type="button" 
                                    onClick={handleReset}
                                    style={{ color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                                >
                                    Reset Server Connection
                                </button>
                            </div>
                        )}
                    </FormContainer>
                </form>
            </div>
        </div>
    );
};

export default Login;
