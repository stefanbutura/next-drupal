import { QueryClientProvider } from '@tanstack/react-query'
import { ConfigProvider, notification } from 'antd'

import { AppStateProvider } from '@edw/base/contexts'
import { queryClient } from '@edw/base/helpers'
import { AppProps } from '@edw/base/types'

export function App({
  children,
  initialAppState,
  theme,
}: AppProps): React.JSX.Element {
  const [, contextHolder] = notification.useNotification()
  return (
    <AppStateProvider value={initialAppState}>
      <QueryClientProvider client={queryClient}>
        <ConfigProvider theme={{ ...theme, cssVar: { key: 'edw' } }}>
          {contextHolder}
          {children}
        </ConfigProvider>
      </QueryClientProvider>
    </AppStateProvider>
  )
}

export default App
