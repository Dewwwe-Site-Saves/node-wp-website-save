'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * A credential that is not the user's own (FTP password): masked on screen, but rendered as a text input so browsers and password managers never offer to save it as a login. A "Show" toggle reveals it while typing.
 */
export function SecretInput({
    id,
    value,
    onChange,
    placeholder,
    required,
}: {
    id: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    required?: boolean;
}) {
    const [visible, setVisible] = useState(false);

    return (
        <div className="flex gap-2">
            <Input
                id={id}
                type="text"
                autoComplete="off"
                spellCheck={false}
                data-1p-ignore
                data-lpignore="true"
                data-bwignore
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                required={required}
                className={visible ? 'font-mono' : 'font-mono secret-text'}
            />
            <Button
                type="button"
                variant="outline"
                onClick={() => setVisible(!visible)}
                aria-label={visible ? 'Hide password' : 'Show password'}
            >
                {visible ? 'Hide' : 'Show'}
            </Button>
        </div>
    );
}
