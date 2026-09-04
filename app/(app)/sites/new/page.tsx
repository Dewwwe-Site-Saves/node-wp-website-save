import { SiteForm } from '@/components/SiteForm';

export default function NewSitePage() {
    return (
        <div className="max-w-3xl">
            <h1 className="text-2xl font-bold mb-6">Add Site</h1>
            <SiteForm mode="create" />
        </div>
    );
}
