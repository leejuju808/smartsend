import TemplateRewriter from '../../TemplateRewriter';
import { SmartRewriter } from '@/components/composer/SmartRewriter';

export default function ComposePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Compose Template</h1>
      <TemplateRewriter />
      <SmartRewriter
        initialBody={''}
        initialSubject={''}
        onApplyBody={(v)=>{/* integrate with your form state */}}
        onApplySubject={(v)=>{/* integrate with your form state */}}
      />
    </div>
  );
}


