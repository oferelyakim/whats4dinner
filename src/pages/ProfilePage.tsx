import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { ArrowLeft, Camera } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAppStore } from '@/stores/appStore'
import { supabase } from '@/services/supabase'

export function ProfilePage() {
  const navigate = useNavigate()
  const { profile, setProfile } = useAppStore()

  const [displayName, setDisplayName] = useState(profile?.display_name ?? '')
  const [saved, setSaved] = useState(false)

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .update({ display_name: displayName.trim() })
        .eq('id', profile!.id)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      setProfile({ ...profile!, display_name: data.display_name })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  return (
    <div className="px-4 py-4 space-y-5">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="h-9 w-9 rounded-xl flex items-center justify-center bg-slate-100 dark:bg-surface-dark-elevated active:scale-90 transition-transform"
        >
          <ArrowLeft className="h-5 w-5 text-slate-600 dark:text-slate-400" />
        </button>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Profile</h2>
      </div>

      {/* Avatar */}
      <div className="flex flex-col items-center">
        <div className="relative">
          <div className="h-20 w-20 rounded-full bg-brand-500/20 flex items-center justify-center text-brand-500 font-bold text-3xl">
            {displayName?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="absolute bottom-0 right-0 h-7 w-7 rounded-full bg-surface-dark-elevated border-2 border-white dark:border-surface-dark flex items-center justify-center">
            <Camera className="h-3.5 w-3.5 text-slate-400" />
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-2">{profile?.email}</p>
      </div>

      {/* Form */}
      <div className="space-y-4">
        <Input
          label="Display Name"
          placeholder="How your family sees you"
          value={displayName}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDisplayName(e.target.value)}
        />

        <Button
          className="w-full"
          onClick={() => saveMutation.mutate()}
          disabled={!displayName.trim() || saveMutation.isPending || displayName.trim() === profile?.display_name}
        >
          {saved ? 'Saved!' : saveMutation.isPending ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  )
}
