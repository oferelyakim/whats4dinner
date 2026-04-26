import { useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { persistQueryCache, restoreQueryCache } from '@/lib/queryPersist'
import { AuthGuard } from '@/components/auth/AuthGuard'
import { AppShell } from '@/components/layout/AppShell'
import { ToastProvider } from '@/components/ui/Toast'
import { SkinProvider } from '@/components/SkinProvider'
import { ReviewPrompt } from '@/components/ReviewPrompt'
import { supabase } from '@/services/supabase'
import { probeEdgeVersions } from '@/services/edgeVersionProbe'

// Lazy-loaded pages for code splitting
const HomePage = lazy(() => import('@/pages/HomePage').then(m => ({ default: m.HomePage })))
const RecipesPage = lazy(() => import('@/pages/RecipesPage').then(m => ({ default: m.RecipesPage })))
const RecipeFormPage = lazy(() => import('@/pages/RecipeFormPage').then(m => ({ default: m.RecipeFormPage })))
const RecipeDetailPage = lazy(() => import('@/pages/RecipeDetailPage').then(m => ({ default: m.RecipeDetailPage })))
const ListsPage = lazy(() => import('@/pages/ListsPage').then(m => ({ default: m.ListsPage })))
const NewListPage = lazy(() => import('@/pages/NewListPage').then(m => ({ default: m.NewListPage })))
const ShoppingListPage = lazy(() => import('@/pages/ShoppingListPage').then(m => ({ default: m.ShoppingListPage })))
const PlanV2Page = lazy(() => import('@/pages/PlanV2Page').then(m => ({ default: m.PlanV2Page })))
const MorePage = lazy(() => import('@/pages/MorePage').then(m => ({ default: m.MorePage })))
const CirclesPage = lazy(() => import('@/pages/CirclesPage').then(m => ({ default: m.CirclesPage })))
const CircleDetailPage = lazy(() => import('@/pages/CircleDetailPage').then(m => ({ default: m.CircleDetailPage })))
const JoinCirclePage = lazy(() => import('@/pages/JoinCirclePage').then(m => ({ default: m.JoinCirclePage })))
const StoresPage = lazy(() => import('@/pages/StoresPage').then(m => ({ default: m.StoresPage })))
const StoreRoutePage = lazy(() => import('@/pages/StoreRoutePage').then(m => ({ default: m.StoreRoutePage })))
const RecipeImportPage = lazy(() => import('@/pages/RecipeImportPage').then(m => ({ default: m.RecipeImportPage })))
const SharedRecipePage = lazy(() => import('@/pages/SharedRecipePage').then(m => ({ default: m.SharedRecipePage })))
const EventsPage = lazy(() => import('@/pages/EventsPage').then(m => ({ default: m.EventsPage })))
const EventDetailPage = lazy(() => import('@/pages/EventDetailPage').then(m => ({ default: m.EventDetailPage })))
const ProfilePage = lazy(() => import('@/pages/ProfilePage').then(m => ({ default: m.ProfilePage })))
const MealMenusPage = lazy(() => import('@/pages/MealMenusPage').then(m => ({ default: m.MealMenusPage })))
const JoinEventPage = lazy(() => import('@/pages/JoinEventPage').then(m => ({ default: m.JoinEventPage })))
const ResetPasswordPage = lazy(() => import('@/pages/ResetPasswordPage').then(m => ({ default: m.ResetPasswordPage })))
const ActivitiesPage = lazy(() => import('@/pages/ActivitiesPage').then(m => ({ default: m.ActivitiesPage })))
const ChoresPage = lazy(() => import('@/pages/ChoresPage').then(m => ({ default: m.ChoresPage })))
const SupplyKitFormPage = lazy(() => import('@/pages/SupplyKitFormPage').then(m => ({ default: m.SupplyKitFormPage })))
const FoodHubPage = lazy(() => import('@/pages/FoodHubPage').then(m => ({ default: m.FoodHubPage })))
const HouseholdHubPage = lazy(() => import('@/pages/HouseholdHubPage').then(m => ({ default: m.HouseholdHubPage })))
const GrocerCallbackPage = lazy(() => import('@/pages/GrocerCallbackPage').then(m => ({ default: m.GrocerCallbackPage })))

function PageLoader() {
  return (
    <div className="flex justify-center py-20">
      <div className="h-6 w-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
      networkMode: 'offlineFirst',
    },
    mutations: {
      networkMode: 'offlineFirst',
    },
  },
})

// Restore cache on load
restoreQueryCache(queryClient)

// Persist cache periodically and on visibility change
if (typeof window !== 'undefined') {
  setInterval(() => persistQueryCache(queryClient), 30000)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      persistQueryCache(queryClient)
    }
  })
}

export default function App() {
  useEffect(() => {
    // Sync indicator: show when back online
    function handleOnline() {
      queryClient.invalidateQueries()
    }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [])

  useEffect(() => {
    // v1.16.0: ping each edge function once on boot so a stale Supabase
    // deploy gets surfaced before the user clicks an AI button. Result is
    // stored in localStorage; AI dialogs read it for a "server-version
    // mismatch" banner. Silent on success.
    void probeEdgeVersions()
  }, [])

  useEffect(() => {
    // Claim any pending seat invites that were sent to this email address.
    // One-shot per session — fires after the session is established.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user?.email) {
        supabase
          .rpc('claim_seat_by_email', { p_email: session.user.email })
          .then(() => {
            // Ignore result — the RPC is idempotent and a no-op when no invite exists.
          })
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <SkinProvider>
      <ToastProvider>
      <BrowserRouter>
        <Routes>
          {/* Public routes (outside AuthGuard) */}
          <Route path="/join/:code" element={<JoinCirclePage />} />
          <Route path="/join-event/:code" element={<JoinEventPage />} />
          <Route path="/r/:code" element={<SharedRecipePage />} />
          <Route path="/reset-password" element={<Suspense fallback={<PageLoader />}><ResetPasswordPage /></Suspense>} />
        </Routes>
        <AuthGuard>
          <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route element={<AppShell />}>
              {/* Home */}
              <Route path="/" element={<HomePage />} />

              {/* Food hub + sub-routes */}
              <Route path="/food" element={<FoodHubPage />} />
              <Route path="/recipes" element={<RecipesPage />} />
              <Route path="/recipes/new" element={<RecipeFormPage />} />
              <Route path="/recipes/import" element={<RecipeImportPage />} />
              <Route path="/recipes/new-kit" element={<SupplyKitFormPage />} />
              <Route path="/recipes/:id" element={<RecipeDetailPage />} />
              <Route path="/recipes/:id/edit" element={<RecipeFormPage />} />
              <Route path="/lists" element={<ListsPage />} />
              <Route path="/lists/new" element={<NewListPage />} />
              <Route path="/lists/:id" element={<ShoppingListPage />} />
              <Route path="/plan" element={<Navigate to="/plan-v2" replace />} />
              <Route path="/plan-v2" element={<PlanV2Page />} />
              <Route path="/food/templates" element={<MealMenusPage />} />
              <Route path="/food/stores" element={<StoresPage />} />
              <Route path="/food/stores/:id" element={<StoreRoutePage />} />

              {/* Events */}
              <Route path="/events" element={<EventsPage />} />
              <Route path="/events/:id" element={<EventDetailPage />} />

              {/* Household hub + sub-routes */}
              <Route path="/household" element={<HouseholdHubPage />} />
              <Route path="/household/activities" element={<ActivitiesPage />} />
              <Route path="/household/chores" element={<ChoresPage />} />

              {/* Profile / Settings */}
              <Route path="/profile" element={<MorePage />} />
              <Route path="/profile/circles" element={<CirclesPage />} />
              <Route path="/profile/circles/:id" element={<CircleDetailPage />} />
              <Route path="/profile/settings" element={<ProfilePage />} />

              {/* Grocer OAuth callback */}
              <Route path="/grocer/callback/:provider" element={<GrocerCallbackPage />} />

              {/* Legacy redirects — keep old paths working */}
              <Route path="/more" element={<MorePage />} />
              <Route path="/more/circles" element={<CirclesPage />} />
              <Route path="/more/circles/:id" element={<CircleDetailPage />} />
              <Route path="/more/profile" element={<ProfilePage />} />
              <Route path="/more/activities" element={<ActivitiesPage />} />
              <Route path="/more/chores" element={<ChoresPage />} />
              <Route path="/more/menus" element={<MealMenusPage />} />
              <Route path="/more/stores" element={<StoresPage />} />
              <Route path="/more/stores/:id" element={<StoreRoutePage />} />
            </Route>
          </Routes>
          </Suspense>
        </AuthGuard>
      </BrowserRouter>
      <ReviewPrompt />
      </ToastProvider>
      </SkinProvider>
    </QueryClientProvider>
  )
}
