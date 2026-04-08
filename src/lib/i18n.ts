import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Locale = 'en' | 'he'

interface I18nState {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: string) => string
  dir: () => 'ltr' | 'rtl'
}

const translations: Record<string, Record<Locale, string>> = {
  // App
  'app.name': { en: 'OurTable', he: 'השולחן שלנו' },
  'app.tagline': { en: 'Meal planning made easy', he: 'תכנון ארוחות בקלות' },

  // Navigation
  'nav.home': { en: 'Home', he: 'בית' },
  'nav.recipes': { en: 'Recipes', he: 'מתכונים' },
  'nav.lists': { en: 'Lists', he: 'רשימות' },
  'nav.plan': { en: 'Plan', he: 'תכנון' },
  'nav.more': { en: 'More', he: 'עוד' },

  // Auth
  'auth.signIn': { en: 'Sign In', he: 'התחברות' },
  'auth.signUp': { en: 'Sign Up', he: 'הרשמה' },
  'auth.signOut': { en: 'Sign Out', he: 'התנתקות' },
  'auth.email': { en: 'Email', he: 'אימייל' },
  'auth.password': { en: 'Password', he: 'סיסמה' },
  'auth.name': { en: 'Name', he: 'שם' },
  'auth.continueWithGoogle': { en: 'Continue with Google', he: 'המשך עם Google' },
  'auth.or': { en: 'or', he: 'או' },
  'auth.noAccount': { en: "Don't have an account?", he: 'אין לך חשבון?' },
  'auth.hasAccount': { en: 'Already have an account?', he: 'יש לך חשבון?' },
  'auth.checkEmail': { en: 'Check your email', he: 'בדוק את האימייל שלך' },
  'auth.emailSent': { en: 'We sent a confirmation link to', he: 'שלחנו קישור אישור ל' },
  'auth.checkSpam': { en: 'Check your spam/junk folder if you don\'t see it.', he: 'בדוק את תיקיית הספאם אם לא מצאת.' },
  'auth.backToSignIn': { en: 'Back to Sign In', he: 'חזרה להתחברות' },

  // Home
  'home.goodMorning': { en: 'Good morning', he: 'בוקר טוב' },
  'home.goodAfternoon': { en: 'Good afternoon', he: 'צהריים טובים' },
  'home.goodEvening': { en: 'Good evening', he: 'ערב טוב' },
  'home.letsPlan': { en: "Let's plan some meals", he: 'בואו נתכנן ארוחות' },
  'home.activeLists': { en: 'Active Lists', he: 'רשימות פעילות' },
  'home.recentRecipes': { en: 'Recent Recipes', he: 'מתכונים אחרונים' },
  'home.viewAll': { en: 'View all', he: 'הצג הכל' },

  // Quick actions
  'action.newList': { en: 'New List', he: 'רשימה חדשה' },
  'action.addRecipe': { en: 'Add Recipe', he: 'הוסף מתכון' },
  'action.planWeek': { en: 'Plan Week', he: 'תכנון שבועי' },
  'action.myCircles': { en: 'My Circles', he: 'המעגלים שלי' },

  // Recipes
  'recipe.new': { en: 'New Recipe', he: 'מתכון חדש' },
  'recipe.edit': { en: 'Edit Recipe', he: 'עריכת מתכון' },
  'recipe.delete': { en: 'Delete Recipe', he: 'מחיקת מתכון' },
  'recipe.search': { en: 'Search recipes...', he: 'חיפוש מתכונים...' },
  'recipe.noRecipes': { en: 'No recipes yet', he: 'אין מתכונים עדיין' },
  'recipe.addFirst': { en: 'Add your favorite recipes and import them from links', he: 'הוסף את המתכונים האהובים שלך או ייבא מקישורים' },
  'recipe.title': { en: 'Title', he: 'כותרת' },
  'recipe.description': { en: 'Description', he: 'תיאור' },
  'recipe.instructions': { en: 'Instructions', he: 'הוראות הכנה' },
  'recipe.ingredients': { en: 'Ingredients', he: 'מרכיבים' },
  'recipe.tags': { en: 'Tags', he: 'תגיות' },
  'recipe.prepTime': { en: 'Prep (min)', he: 'הכנה (דק)' },
  'recipe.cookTime': { en: 'Cook (min)', he: 'בישול (דק)' },
  'recipe.servings': { en: 'Servings', he: 'מנות' },
  'recipe.save': { en: 'Save Recipe', he: 'שמור מתכון' },
  'recipe.update': { en: 'Update Recipe', he: 'עדכן מתכון' },
  'recipe.addToList': { en: 'Add to List', he: 'הוסף לרשימה' },
  'recipe.importUrl': { en: 'Import from URL', he: 'ייבוא מקישור' },
  'recipe.importPhoto': { en: 'From Photo', he: 'מתמונה' },

  // Shopping lists
  'list.shoppingLists': { en: 'Shopping Lists', he: 'רשימות קניות' },
  'list.newList': { en: 'New List', he: 'רשימה חדשה' },
  'list.noLists': { en: 'No shopping lists', he: 'אין רשימות קניות' },
  'list.createList': { en: 'Create List', he: 'צור רשימה' },
  'list.addItem': { en: 'Add', he: 'הוסף' },
  'list.itemsDone': { en: 'items done', he: 'פריטים הושלמו' },
  'list.noItems': { en: 'No items yet', he: 'אין פריטים עדיין' },
  'list.share': { en: 'Share List', he: 'שתף רשימה' },
  'list.delete': { en: 'Delete List', he: 'מחק רשימה' },

  // Circles
  'circle.myCircles': { en: 'My Circles', he: 'המעגלים שלי' },
  'circle.create': { en: 'Create Circle', he: 'צור מעגל' },
  'circle.join': { en: 'Join', he: 'הצטרף' },
  'circle.invite': { en: 'Invite', he: 'הזמן' },
  'circle.inviteCode': { en: 'Invite Code', he: 'קוד הזמנה' },
  'circle.leave': { en: 'Leave Circle', he: 'עזוב מעגל' },
  'circle.delete': { en: 'Delete Circle', he: 'מחק מעגל' },
  'circle.members': { en: 'Members', he: 'חברים' },
  'circle.noCircles': { en: 'No circles yet', he: 'אין מעגלים עדיין' },

  // Events
  'event.events': { en: 'Events', he: 'אירועים' },
  'event.newEvent': { en: 'New Event', he: 'אירוע חדש' },
  'event.overview': { en: 'Overview', he: 'סקירה' },
  'event.menu': { en: 'Menu', he: 'תפריט' },
  'event.supplies': { en: 'Supplies', he: 'ציוד' },
  'event.tasks': { en: 'Tasks', he: 'משימות' },
  'event.attending': { en: 'Attending', he: 'מגיעים' },
  'event.claimed': { en: 'Claimed', he: 'נתפס' },
  'event.tasksDone': { en: 'Tasks Done', he: 'משימות שהושלמו' },
  'event.needsSomeone': { en: 'Needs someone', he: 'צריך מישהו' },
  'event.illBringIt': { en: "I'll bring it", he: 'אני אביא' },
  'event.illDoIt': { en: "I'll do it", he: 'אני אעשה' },
  'event.addDish': { en: 'Add Dish', he: 'הוסף מנה' },
  'event.addSupply': { en: 'Add Supply', he: 'הוסף ציוד' },
  'event.addTask': { en: 'Add Task', he: 'הוסף משימה' },
  'event.clone': { en: 'Clone Event (reuse items)', he: 'שכפל אירוע (שימוש חוזר)' },
  'event.delete': { en: 'Delete Event', he: 'מחק אירוע' },
  'event.makeHost': { en: 'Make host', he: 'הפוך למארגן' },

  // Meal plan
  'plan.mealPlan': { en: 'Meal Plan', he: 'תכנון ארוחות' },
  'plan.addWeekToList': { en: 'Add Week to List', he: 'הוסף שבוע לרשימה' },
  'plan.copyToNextWeek': { en: 'Copy to Next Week', he: 'העתק לשבוע הבא' },
  'plan.backToThisWeek': { en: 'Back to this week', he: 'חזרה לשבוע הנוכחי' },
  'plan.breakfast': { en: 'Breakfast', he: 'ארוחת בוקר' },
  'plan.lunch': { en: 'Lunch', he: 'ארוחת צהריים' },
  'plan.dinner': { en: 'Dinner', he: 'ארוחת ערב' },
  'plan.snack': { en: 'Snack', he: 'חטיף' },
  'plan.today': { en: 'Today', he: 'היום' },

  // More
  'more.more': { en: 'More', he: 'עוד' },
  'more.mealTemplates': { en: 'Meal Templates', he: 'תבניות ארוחות' },
  'more.events': { en: 'Events', he: 'אירועים' },
  'more.myStores': { en: 'My Stores', he: 'החנויות שלי' },
  'more.profile': { en: 'Profile', he: 'פרופיל' },
  'more.theme': { en: 'Theme', he: 'ערכת נושא' },
  'more.language': { en: 'Language', he: 'שפה' },
  'more.light': { en: 'Light', he: 'בהיר' },
  'more.dark': { en: 'Dark', he: 'כהה' },
  'more.system': { en: 'System', he: 'מערכת' },

  // Common
  'common.cancel': { en: 'Cancel', he: 'ביטול' },
  'common.save': { en: 'Save', he: 'שמור' },
  'common.delete': { en: 'Delete', he: 'מחק' },
  'common.edit': { en: 'Edit', he: 'ערוך' },
  'common.add': { en: 'Add', he: 'הוסף' },
  'common.create': { en: 'Create', he: 'צור' },
  'common.done': { en: 'Done', he: 'סיום' },
  'common.back': { en: 'Back', he: 'חזרה' },
  'common.search': { en: 'Search...', he: 'חיפוש...' },
  'common.loading': { en: 'Loading...', he: 'טוען...' },
  'common.areYouSure': { en: 'Are you sure?', he: 'האם את/ה בטוח/ה?' },
  'common.tapToDismiss': { en: 'tap to dismiss', he: 'לחץ לסגירה' },

  // Activities
  'activity.activities': { en: 'Activities', he: 'פעילויות' },
  'activity.newActivity': { en: 'New Activity', he: 'פעילות חדשה' },
  'activity.edit': { en: 'Edit Activity', he: 'עריכת פעילות' },
  'activity.noActivities': { en: 'No activities yet', he: 'אין פעילויות עדיין' },
  'activity.noActivitiesDesc': { en: 'Add recurring schedules like soccer practice, piano lessons, or weekly chores', he: 'הוסף לוח זמנים חוזר כמו אימון כדורגל, שיעור פסנתר, או מטלות שבועיות' },
  'activity.noActivitiesDate': { en: 'No activities on this day', he: 'אין פעילויות ביום זה' },
  'activity.subtitle': { en: 'Schedule recurring activities, lessons, sports, carpooling, and chores for your family.', he: 'תזמון פעילויות חוזרות, שיעורים, ספורט, הסעות ומטלות למשפחה.' },
  'activity.selectCircle': { en: 'Select a circle first', he: 'בחר מעגל קודם' },
  'activity.selectCircleDesc': { en: 'Go to Circles and select one to manage activities', he: 'עבור למעגלים ובחר אחד לניהול פעילויות' },
  'activity.activityName': { en: 'Activity Name', he: 'שם הפעילות' },
  'activity.activityNamePlaceholder': { en: 'e.g., Soccer Practice', he: 'למשל, אימון כדורגל' },
  'activity.forWhom': { en: 'For whom', he: 'עבור מי' },
  'activity.forWhomPlaceholder': { en: 'e.g., Emma, Dad, Everyone', he: 'למשל, אמה, אבא, כולם' },
  'activity.category': { en: 'Category', he: 'קטגוריה' },
  'activity.location': { en: 'Location (optional)', he: 'מיקום (אופציונלי)' },
  'activity.locationPlaceholder': { en: 'e.g., City Sports Center', he: 'למשל, מרכז ספורט עירוני' },
  'activity.repeats': { en: 'Repeats', he: 'חזרות' },
  'activity.once': { en: 'Once', he: 'פעם אחת' },
  'activity.daily': { en: 'Daily', he: 'יומי' },
  'activity.weekly': { en: 'Weekly', he: 'שבועי' },
  'activity.biweekly': { en: 'Bi-weekly', he: 'דו-שבועי' },
  'activity.onDays': { en: 'On which days', he: 'באילו ימים' },
  'activity.startDate': { en: 'Start Date', he: 'תאריך התחלה' },
  'activity.endDate': { en: 'End Date (optional)', he: 'תאריך סיום (אופציונלי)' },
  'activity.startTime': { en: 'Start Time', he: 'שעת התחלה' },
  'activity.endTime': { en: 'End Time', he: 'שעת סיום' },
  'activity.skipHolidays': { en: 'Skip holidays & school breaks', he: 'דלג על חגים וחופשות' },
  'activity.notes': { en: 'Notes (optional)', he: 'הערות (אופציונלי)' },
  'activity.notesPlaceholder': { en: 'Any details...', he: 'פרטים נוספים...' },
  'activity.until': { en: 'Until', he: 'עד' },
  'activity.unassigned': { en: 'Unassigned', he: 'לא משויך' },
  'activity.weekView': { en: 'Week View', he: 'תצוגת שבוע' },

  // Activity categories
  'activity.cat.sports': { en: 'Sports', he: 'ספורט' },
  'activity.cat.music': { en: 'Music', he: 'מוזיקה' },
  'activity.cat.arts': { en: 'Arts', he: 'אומנות' },
  'activity.cat.education': { en: 'Education', he: 'לימודים' },
  'activity.cat.social': { en: 'Social', he: 'חברתי' },
  'activity.cat.chores': { en: 'Chores', he: 'מטלות' },
  'activity.cat.carpool': { en: 'Carpool', he: 'הסעות' },
  'activity.cat.other': { en: 'Other', he: 'אחר' },

  // Activity days
  'activity.day.su': { en: 'Su', he: 'א' },
  'activity.day.mo': { en: 'Mo', he: 'ב' },
  'activity.day.tu': { en: 'Tu', he: 'ג' },
  'activity.day.we': { en: 'We', he: 'ד' },
  'activity.day.th': { en: 'Th', he: 'ה' },
  'activity.day.fr': { en: 'Fr', he: 'ו' },
  'activity.day.sa': { en: 'Sa', he: 'ש' },

  // Activity participants
  'activity.participants': { en: 'Participants', he: 'משתתפים' },
  'activity.participant': { en: 'Participant', he: 'משתתף' },
  'activity.escort': { en: 'Escort', he: 'מלווה' },
  'activity.escorts': { en: 'Escorts', he: 'מלווים' },
  'activity.driver': { en: 'Driver', he: 'נהג' },
  'activity.drivers': { en: 'Drivers', he: 'נהגים' },
  'activity.supervisor': { en: 'Supervisor', he: 'מפקח' },
  'activity.supervisors': { en: 'Supervisors', he: 'מפקחים' },
  'activity.participantNamePlaceholder': { en: 'Name', he: 'שם' },

  // Activity bring items
  'activity.whatToBring': { en: 'What to Bring', he: 'מה להביא' },
  'activity.bringItems': { en: 'Items to Bring', he: 'פריטים להביא' },
  'activity.addItem': { en: 'Add Item', he: 'הוסף פריט' },
  'activity.addItemPlaceholder': { en: 'e.g., Water bottle, Cleats', he: 'למשל, בקבוק מים, נעלי כדורגל' },

  // More menu
  'more.activities': { en: 'Activities', he: 'פעילויות' },
  'more.activitiesDesc': { en: 'Schedules, sports, lessons', he: 'לוחות זמנים, ספורט, שיעורים' },
  'more.chores': { en: 'Chores', he: 'מטלות בית' },
  'more.choresDesc': { en: 'Track family chores & earn points', he: 'מעקב מטלות משפחתיות וצבירת נקודות' },

  // Chores
  'chore.chores': { en: 'Chores', he: 'מטלות בית' },
  'chore.new': { en: 'New Chore', he: 'מטלה חדשה' },
  'chore.edit': { en: 'Edit Chore', he: 'עריכת מטלה' },
  'chore.delete': { en: 'Delete Chore', he: 'מחיקת מטלה' },
  'chore.markDone': { en: 'Done!', he: '!בוצע' },
  'chore.done': { en: 'Done', he: 'בוצע' },
  'chore.frequency': { en: 'Frequency', he: 'תדירות' },
  'chore.daily': { en: 'Daily', he: 'יומי' },
  'chore.weekly': { en: 'Weekly', he: 'שבועי' },
  'chore.biweekly': { en: 'Bi-weekly', he: 'דו-שבועי' },
  'chore.monthly': { en: 'Monthly', he: 'חודשי' },
  'chore.once': { en: 'One-time', he: 'פעם אחת' },
  'chore.points': { en: 'pts', he: 'נק' },
  'chore.streak': { en: 'Streak', he: 'רצף' },
  'chore.assignedTo': { en: 'Assigned to', he: 'מוקצה ל' },
  'chore.assignedPlaceholder': { en: 'e.g., Emma, Dad', he: 'למשל, אמה, אבא' },
  'chore.noChores': { en: 'No chores yet', he: 'אין מטלות עדיין' },
  'chore.addFirst': { en: 'Create chores for family members and track completions', he: 'צור מטלות לבני המשפחה ועקוב אחר ביצוע' },
  'chore.weekSummary': { en: 'Weekly Summary', he: 'סיכום שבועי' },
  'chore.completed': { en: 'Completed', he: 'הושלמו' },
  'chore.completedToday': { en: 'Completed today', he: 'הושלם היום' },
  'chore.thisWeek': { en: 'this week', he: 'השבוע' },
  'chore.noCompletions': { en: 'No completions this week', he: 'אין השלמות השבוע' },
  'chore.selectCircle': { en: 'Go to Circles and select one to manage chores', he: 'עבור למעגלים ובחר אחד לניהול מטלות' },
  'chore.unassigned': { en: 'Unassigned', he: 'לא משויך' },
  'chore.choreName': { en: 'Chore Name', he: 'שם המטלה' },
  'chore.choreNamePlaceholder': { en: 'e.g., Take out trash', he: 'למשל, להוציא את הזבל' },
  'chore.icon': { en: 'Icon', he: 'אייקון' },
  'chore.onDays': { en: 'On which days', he: 'באילו ימים' },
  'chore.dueTime': { en: 'Due Time', he: 'שעת ביצוע' },
  'chore.description': { en: 'Description (optional)', he: 'תיאור (אופציונלי)' },
  'chore.descriptionPlaceholder': { en: 'Any details...', he: 'פרטים נוספים...' },
}

export const useI18n = create<I18nState>()(
  persist(
    (set, get) => ({
      locale: 'en' as Locale,
      setLocale: (locale: Locale) => {
        set({ locale })
        // Update document direction
        document.documentElement.dir = locale === 'he' ? 'rtl' : 'ltr'
        document.documentElement.lang = locale
      },
      t: (key: string) => {
        const locale = get().locale
        return translations[key]?.[locale] ?? translations[key]?.en ?? key
      },
      dir: () => get().locale === 'he' ? 'rtl' : 'ltr',
    }),
    {
      name: 'w4d-i18n',
      partialize: (state) => ({ locale: state.locale }),
      onRehydrateStorage: () => (state) => {
        if (state?.locale === 'he') {
          document.documentElement.dir = 'rtl'
          document.documentElement.lang = 'he'
        }
      },
    }
  )
)
