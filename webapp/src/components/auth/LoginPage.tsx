import { AuthProvider } from './AuthProvider';
import LoginForm from './LoginForm';

export default function LoginPage() {
  return (
    <AuthProvider>
      <LoginForm />
    </AuthProvider>
  );
}
