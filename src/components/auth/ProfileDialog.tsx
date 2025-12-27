import {
  ChevronDown,
  CreditCard,
  FolderSearch,
  LogOut,
  Moon,
  Sparkles,
  Sun,
  User,
  UserX,
  X,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getDomainDisplayName, getImplementedDomains } from '@/lib/categorization';
import type { AutocompleteDomain } from '@/lib/categorization/types';
import { useTheme } from '@/lib/useTheme';
import type { SubscriptionTier } from '@/schemas';
import { LinkedEmailsSection } from './LinkedEmailsSection';

interface ProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSignOut: () => void;
  onDeleteAccount: () => void;
  // User settings
  defaultAutocompleteDomain?: AutocompleteDomain;
  enableAutoCategorization?: boolean;
  onChangeDefaultAutocompleteDomain?: (domain: AutocompleteDomain) => void;
  onToggleAutoCategorization?: () => void;
  // Subscription info
  subscriptionTier?: SubscriptionTier;
  listCount?: number;
  maxLists?: number;
  onUpgradeClick?: () => void;
  onManageBillingClick?: () => void;
}

export function ProfileDialog({
  open,
  onOpenChange,
  onSignOut,
  onDeleteAccount,
  defaultAutocompleteDomain = 'grocery',
  enableAutoCategorization = true,
  onChangeDefaultAutocompleteDomain,
  onToggleAutoCategorization,
  subscriptionTier = 'free',
  listCount = 0,
  maxLists = 3,
  onUpgradeClick,
  onManageBillingClick,
}: ProfileDialogProps) {
  const { isDark, toggleTheme } = useTheme();

  const handleSignOut = () => {
    onOpenChange(false);
    onSignOut();
  };

  const handleDeleteAccount = () => {
    onOpenChange(false);
    onDeleteAccount();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogClose asChild>
          <button
            type="button"
            className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-surface-elevated transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-neutral-950 focus:ring-offset-2"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </DialogClose>
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-surface-tertiary">
            <User className="h-6 w-6 text-content-secondary" />
          </div>
          <DialogTitle className="text-center">Profile</DialogTitle>
          <DialogDescription className="text-center">
            Manage your account settings
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 flex flex-col gap-3">
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={toggleTheme}
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {isDark ? 'Light Mode' : 'Dark Mode'}
          </Button>

          {/* Autocomplete and Auto-categorization settings */}
          {onChangeDefaultAutocompleteDomain && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" className="w-full justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <FolderSearch className="h-4 w-4" />
                    Autocomplete
                  </span>
                  <span className="flex items-center gap-1">
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        defaultAutocompleteDomain !== 'none'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                          : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400'
                      }`}
                    >
                      {defaultAutocompleteDomain === 'none'
                        ? 'Off'
                        : defaultAutocompleteDomain === 'all'
                          ? 'All'
                          : getDomainDisplayName(defaultAutocompleteDomain)}
                    </span>
                    <ChevronDown className="h-4 w-4 text-content-secondary" />
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuRadioGroup
                  value={defaultAutocompleteDomain}
                  onValueChange={(value) =>
                    onChangeDefaultAutocompleteDomain(value as AutocompleteDomain)
                  }
                >
                  <DropdownMenuRadioItem value="none">Off</DropdownMenuRadioItem>
                  {getImplementedDomains().map((domainId) => (
                    <DropdownMenuRadioItem key={domainId} value={domainId}>
                      {getDomainDisplayName(domainId)}
                    </DropdownMenuRadioItem>
                  ))}
                  <DropdownMenuRadioItem value="all">All</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {onToggleAutoCategorization && (
            <Button
              type="button"
              variant="outline"
              className="w-full justify-between gap-2"
              onClick={onToggleAutoCategorization}
            >
              <span className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                Auto-categorize
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded ${
                  enableAutoCategorization
                    ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                    : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400'
                }`}
              >
                {enableAutoCategorization ? 'On' : 'Off'}
              </span>
            </Button>
          )}

          {/* Linked Emails Section */}
          <div className="border-t border-border-default pt-3">
            <LinkedEmailsSection />
          </div>

          {/* Subscription Section */}
          <div className="border-t border-border-default pt-3 flex flex-col gap-2">
            {maxLists !== -1 && onUpgradeClick && (
              <Button
                type="button"
                variant="outline"
                className="w-full justify-between gap-2"
                onClick={onUpgradeClick}
              >
                <span className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-green-600" />
                  Upgrade Plan
                </span>
                <span className="text-xs text-content-tertiary">
                  {subscriptionTier.charAt(0).toUpperCase() + subscriptionTier.slice(1)} {listCount}
                  /{maxLists}
                </span>
              </Button>
            )}
            {subscriptionTier !== 'free' && onManageBillingClick && (
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={onManageBillingClick}
              >
                <CreditCard className="h-4 w-4" />
                Manage Billing
              </Button>
            )}
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={handleDeleteAccount}
          >
            <UserX className="h-4 w-4" />
            Delete Account
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
