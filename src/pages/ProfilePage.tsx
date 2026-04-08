import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { ArrowLeft, Camera } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAppStore } from '@/stores/appStore'
import { supabase } from '@/services/supabase'
import { useI18n } from '@/lib/i18n'

export function ProfilePage() {
  const navigate = useNavigate()
  const { profile, setProfile } = useAppStore()
  const { t } = useI18n()

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
    <div className="px-4 sm:px-6 py-4 space-y-5 animate-page-enter">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="h-9 w-9 rounded-xl flex items-center justify-center bg-slate-100 dark:bg-surface-dark-elevated active:scale-90 transition-transform"
        >
          <ArrowLeft className="h-5 w-5 text-slate-600 dark:text-slate-400 rtl-flip" />
        </button>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">{t('more.profile')}</h2>
      </div>

      {/* Avatar */}
      <div className="flex flex-col items-center">
        <div className="relative">
          <div className="h-24 w-24 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white font-bold text-4xl shadow-lg shadow-brand-500/20">
            {displayName?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="absolute bottom-0 end-0 h-8 w-8 rounded-full bg-white dark:bg-surface-dark-elevated border-2 border-slate-100 dark:border-surface-dark flex items-center justify-center shadow-sm">
            <Camera className="h-4 w-4 text-slate-400" />
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-3">{profile?.email}</p>
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
          {saved ? t('common.done') : saveMutation.isPending ? t('common.loading') : t('common.save')}
        </Button>
      </div>
    </div>
  )
}
