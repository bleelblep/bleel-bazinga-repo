import { AccountPage } from '../../components/AccountPage'

export default function ListenBrainzSettingsPage() {
	return (
		<AccountPage
			config={{
				service: 'listenbrainz',
				name: 'ListenBrainz',
				usernameKey: 'listenbrainzUsername',
				secretKey: 'listenbrainzToken',
				secretLabel: 'User token',
				secretDescription:
					'Optional for public profiles. Needed if your listens are private.',
				secretUrl: 'https://listenbrainz.org/settings/',
				secretLinkLabel: 'Get your user token',
				secretLinkDescription: 'Opens listenbrainz.org/settings',
			}}
		/>
	)
}
