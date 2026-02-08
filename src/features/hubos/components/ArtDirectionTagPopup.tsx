import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ART_DIRECTION_TAG_CONFIG } from '../artDirectionTagConfig';
import type { ArtDirectionTag } from '../types';

interface ArtDirectionTagPopupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tag: ArtDirectionTag;
}

export default function ArtDirectionTagPopup({ open, onOpenChange, tag }: ArtDirectionTagPopupProps) {
  const config = ART_DIRECTION_TAG_CONFIG[tag];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 fixed inset-0 z-50 bg-black/30 backdrop-blur-sm" />
        <DialogPrimitive.Content
          className="bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-md"
        >
          <div className="space-y-2 text-center">
            <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Direcionamento de arte
            </p>
            <p className="text-lg font-semibold">{config.label}</p>
            <p className="text-sm text-muted-foreground">{config.text}</p>
          </div>
          <div className="flex justify-center">
            <DialogPrimitive.Close asChild>
              <Button type="button">Entendi</Button>
            </DialogPrimitive.Close>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </Dialog>
  );
}
