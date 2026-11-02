# Signing for the App Store on GitHub's Mac (02.11.2026): Apple's cloud did not sign the export ("Invalid
# Signature"), so each build makes its own Apple Distribution certificate and App Store profile with the App Store
# Connect API key, signs with them – and removes both afterwards (an app already uploaded stays valid; a team may hold
# only a few distribution certificates). Uses Spaceship, which comes with fastlane on GitHub's Mac images.
#
#   ruby ios/ci/signing.rb setup   <dir>   – key, certificate and profile into <dir>; prints PROFILE_NAME=…
#   ruby ios/ci/signing.rb cleanup <dir>   – the certificate and the profile removed at Apple again
require 'spaceship'
require 'openssl'
require 'base64'
require 'json'

BUNDLE = 'de.moescheit.golfos'
mode, dir = ARGV
abort('usage: signing.rb setup|cleanup <dir>') unless %w[setup cleanup].include?(mode) && dir

Spaceship::ConnectAPI.token = Spaceship::ConnectAPI::Token.create(
  key_id: ENV.fetch('ASC_KEY_ID'),
  issuer_id: ENV.fetch('ASC_ISSUER_ID'),
  filepath: ENV.fetch('ASC_KEY_PATH')
)

if mode == 'setup'
  key = OpenSSL::PKey::RSA.new(2048)
  csr = OpenSSL::X509::Request.new
  csr.version = 0
  csr.subject = OpenSSL::X509::Name.parse('/CN=GolfOS GitHub build')
  csr.public_key = key.public_key
  csr.sign(key, OpenSSL::Digest.new('SHA256'))

  cert = Spaceship::ConnectAPI::Certificate.create(
    certificate_type: Spaceship::ConnectAPI::Certificate::CertificateType::DISTRIBUTION,
    csr_content: csr.to_pem
  )
  bundle = Spaceship::ConnectAPI::BundleId.find(BUNDLE) or abort("no App ID #{BUNDLE} – register it first")
  name = "GolfOS GitHub #{ENV.fetch('GITHUB_RUN_NUMBER', Time.now.to_i)}"
  profile = Spaceship::ConnectAPI::Profile.create(
    name: name,
    profile_type: Spaceship::ConnectAPI::Profile::ProfileType::IOS_APP_STORE,
    bundle_id_id: bundle.id,
    certificate_ids: [cert.id]
  )

  File.write(File.join(dir, 'key.pem'), key.to_pem)
  File.binwrite(File.join(dir, 'cert.cer'), Base64.decode64(cert.certificate_content))
  File.binwrite(File.join(dir, 'profile.mobileprovision'), Base64.decode64(profile.profile_content))
  File.write(File.join(dir, 'ids.json'), JSON.generate(certificate: cert.id, profile: profile.id))
  puts "PROFILE_NAME=#{name}"
  puts "PROFILE_UUID=#{profile.uuid}"
else
  ids = JSON.parse(File.read(File.join(dir, 'ids.json')))
  begin
    Spaceship::ConnectAPI::Profile.get(profile_id: ids['profile'])&.delete!
  rescue StandardError => e
    warn "profile not removed: #{e.message}"
  end
  begin
    Spaceship::ConnectAPI::Certificate.get(certificate_id: ids['certificate'])&.delete!
  rescue StandardError => e
    warn "certificate not removed: #{e.message}"
  end
  puts 'removed'
end
