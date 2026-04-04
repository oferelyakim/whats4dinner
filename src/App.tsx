import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthGuard } from '@/components/auth/AuthGuard'
import { AppShell } from '@/components/layout/AppShell'
import { HomePage } from '@/pages/HomePage'
import { RecipesPage } from '@/pages/RecipesPage'
import { RecipeFormPage } from '@/pages/RecipeFormPage'
import { RecipeDetailPage } from '@/pages/RecipeDetailPage'
import { ListsPage } from '@/pages/ListsPage'
import { NewListPage } from '@/pages/NewListPage'
import { ShoppingListPage } from '@/pages/ShoppingListPage'
import { PlanPage } from '@/pages/PlanPage'
import { MorePage } from '@/pages/MorePage'
import { CirclesPage } from '@/pages/CirclesPage'
import { CircleDetailPage } from '@/pages/CircleDetailPage'
import { JoinCirclePage } from '@/pages/JoinCirclePage'
import { StoresPage } from '@/pages/StoresPage'
import { StoreRoutePage } from '@/pages/StoreRoutePage'
import { RecipeImportPage } from '@/pages/RecipeImportPage'
import { SharedRecipePage } from '@/pages/SharedRecipePage'
import { EventsPage } from '@/pages/EventsPage'
import { EventDetailPage } from '@/pages/EventDetailPage'
import { ProfilePage } from '@/pages/ProfilePage'
import { MealMenusPage } from '@/pages/MealMenusPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Public routes (outside AuthGuard) */}
          <Route path="/join/:code" element={<JoinCirclePage />} />
          <Route path="/r/:code" element={<SharedRecipePage />} />
        </Routes>
        <AuthGuard>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/recipes" element={<RecipesPage />} />
              <Route path="/recipes/new" element={<RecipeFormPage />} />
              <Route path="/recipes/import" element={<RecipeImportPage />} />
              <Route path="/recipes/:id" element={<RecipeDetailPage />} />
              <Route path="/recipes/:id/edit" element={<RecipeFormPage />} />
              <Route path="/lists" element={<ListsPage />} />
              <Route path="/lists/new" element={<NewListPage />} />
              <Route path="/lists/:id" element={<ShoppingListPage />} />
              <Route path="/plan" element={<PlanPage />} />
              <Route path="/events" element={<EventsPage />} />
              <Route path="/events/:id" element={<EventDetailPage />} />
              <Route path="/more" element={<MorePage />} />
              <Route path="/more/circles" element={<CirclesPage />} />
              <Route path="/more/circles/:id" element={<CircleDetailPage />} />
              <Route path="/more/profile" element={<ProfilePage />} />
              <Route path="/more/menus" element={<MealMenusPage />} />
              <Route path="/more/stores" element={<StoresPage />} />
              <Route path="/more/stores/:id" element={<StoreRoutePage />} />
            </Route>
          </Routes>
        </AuthGuard>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
