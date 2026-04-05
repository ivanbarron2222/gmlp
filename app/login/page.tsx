'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Card } from '@/components/ui/card';
import {
  getRoleHomePath,
  syncStaffSessionFromSupabase,
} from '@/lib/station-role';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    syncStaffSessionFromSupabase()
      .then((profile) => {
        if (profile) {
          router.replace(getRoleHomePath(profile.role));
        }
      })
      .catch(() => {
        // stay on login
      });
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setAuthError('');

    try {
      const supabase = getSupabaseBrowserClient();

      if (!supabase) {
        throw new Error('Missing Supabase environment variables.');
      }

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw error;
      }

      const profile = await syncStaffSessionFromSupabase();

      if (!profile) {
        throw new Error('Unable to resolve staff profile for this account.');
      }

      router.push(getRoleHomePath(profile.role));
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to sign in.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <div className="p-8">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-primary-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold">Globalife Medical Laboratory &amp; Polyclinic</h1>
            <p className="text-sm text-muted-foreground mt-1">System</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <p className="text-lg font-semibold mb-2">Sign In</p>
              <p className="text-sm text-muted-foreground mb-6">Enter your credentials to access the LIS Portal</p>
            </div>

            {/* Email */}
            <div className="space-y-2">
              <label className="text-sm font-medium">EMAIL ADDRESS</label>
              <Input
                type="email"
                placeholder="name@clinic.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11"
              />
            </div>
            {/* Password */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">PASSWORD</label>
                <Link href="#" className="text-xs text-primary hover:underline">
                  Forgot Password?
                </Link>
              </div>
              <Input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-11"
              />
            </div>

            {/* Remember Me */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="remember"
                checked={rememberMe}
                onCheckedChange={(checked) => setRememberMe(checked as boolean)}
              />
              <label htmlFor="remember" className="text-sm font-medium cursor-pointer">
                Remember this device
              </label>
            </div>

            {/* Submit */}
            <Button
              type="submit"
              className="w-full h-11 text-base font-semibold"
              disabled={isLoading}
            >
              {isLoading ? 'Signing in...' : 'Sign In'}
            </Button>

            {authError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {authError}
              </div>
            )}

            <div className="text-center text-sm text-muted-foreground">
              Need a staff account?{' '}
              <Link href="/staff-signup" className="font-medium text-primary hover:underline">
                Request access
              </Link>
            </div>

          </form>

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-border">
            <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 bg-accent rounded-full"></span>
                System Online
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 bg-accent rounded-full"></span>
                AES-256 Encrypted
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 bg-accent rounded-full"></span>
                HIPAA Compliant
              </span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
