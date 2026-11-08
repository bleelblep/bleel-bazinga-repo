import { AccountPage } from '../../components/AccountPage'

export default function LibreFmSettingsPage() {
	return (
		<AccountPage
			config={{
				service: 'librefm',
				name: 'Libre.fm',
				usernameKey: 'librefmUsername',
				secretKey: 'librefmApiKey',
				secretLabel: 'API key',
				secretDescription:
					'A key from your Libre.fm account. It only reads your listening history.',
				secretUrl: 'https://www.last.fm/api/account/create',
				secretLinkLabel: 'Get an API key',
				secretLinkDescription: 'Opens last.fm/api/account/create',
			}}
		/>
	)
}
