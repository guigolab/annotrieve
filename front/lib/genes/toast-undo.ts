import { toast } from "sonner"

/** Toast with an Undo action (gene-set clears, Compare Clear, etc.). */
export function toastUndo(message: string, undo: () => void) {
  toast(message, {
    action: {
      label: "Undo",
      onClick: undo,
    },
  })
}
