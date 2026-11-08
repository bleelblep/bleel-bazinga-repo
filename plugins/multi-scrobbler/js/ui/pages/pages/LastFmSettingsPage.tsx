import { AccountPage } from '../../components/AccountPage'

export default function LastFmSettingsPage() {
	return (
		<AccountPage
			config={{
				service: 'lastfm',
				name: 'Last.fm',
				usernameKey: 'username',
				secretKey: 'apiKey',
				secretLabel: 'API key',
				secretDescription:
					'A free key from your Last.fm account. It only reads your listening history.',
				secretUrl: 'https://www.last.fm/api/account/create',
				secretLinkLabel: 'Get an API key',
				secretLinkDescription: 'Opens last.fm/api/account/create',
			}}
		/>
	)
}
