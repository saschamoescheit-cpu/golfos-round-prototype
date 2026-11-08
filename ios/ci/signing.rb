# Signing for the App Store on GitHub's Mac (02.11.2026): Apple's cloud did not sign the export ("Invalid
# Signature"), so each build makes its own Apple Distribution certificate and App Store profile with the App Store
# Connect API key, signs with them – and removes both afterwards (an app already uploaded stays valid; a team may hold
# only a few distribution certificates). Uses Spaceship, which comes with fastlane on GitHub's Mac images.
#
# A lasting certificate (02.11.2026: each removed certificate sent Sascha an Apple mail "Your Certificate Has Been
# Revoked"): with the secret DIST_KEY_PEM (a private RSA key) the certificate of that key is kept at Apple and used by
# every build – made once when there is none (or it ran out); only the profile is removed afterwards. Without the
# secret, as before: a certificate per build.
#
#   ruby ios/ci/signing.rb setup   <dir>   – key, certificate and profile into <dir>; prints PROFILE_NAME=…
#   ruby ios/ci/signing.rb cleanup <dir>   – the certificate and the profile removed at Apple again
require 'spaceship'
require 'openssl'
require 'base64'
require 'json'
require 'time'

BUNDLE = 'de.moescheit.golfos'
WATCH_BUNDLE = 'de.moescheit.golfos.watchkitapp'
mode, dir = ARGV
abort('usage: signing.rb setup|cleanup <dir>') unless %w[setup cleanup].include?(mode) && dir

Spaceship::ConnectAPI.token = Spaceship::ConnectAPI::Token.create(
  key_id: ENV.fetch('ASC_KEY_ID'),
  issuer_id: ENV.fetch('ASC_ISSUER_ID'),
  filepath: ENV.fetch('ASC_KEY_PATH')
)

if mode == 'setup'
  lasting = !ENV['DIST_KEY_PEM'].to_s.strip.empty?
  key = lasting ? OpenSSL::PKey::RSA.new(ENV['DIST_KEY_PEM']) : OpenSSL::PKey::RSA.new(2048)
  # the kept certificate: a distribution certificate of this key, valid for at least another day
  cert = lasting && Spaceship::ConnectAPI::Certificate.all.find do |c|
    c.certificate_type == Spaceship::ConnectAPI::Certificate::CertificateType::DISTRIBUTION &&
      Time.parse(c.expiration_date.to_s) > Time.now + 86_400 &&
      OpenSSL::X509::Certificate.new(Base64.decode64(c.certificate_content)).public_key.to_der == key.public_key.to_der
  rescue StandardError
    false
  end
  unless cert
    csr = OpenSSL::X509::Request.new
    csr.version = 0
    csr.subject = OpenSSL::X509::Name.parse(lasting ? '/CN=GolfOS GitHub' : '/CN=GolfOS GitHub build')
    csr.public_key = key.public_key
    csr.sign(key, OpenSSL::Digest.new('SHA256'))
    cert = Spaceship::ConnectAPI::Certificate.create(
      certificate_type: Spaceship::ConnectAPI::Certificate::CertificateType::DISTRIBUTION,
      csr_content: csr.to_pem
    )
  end
  puts "CERTIFICATE=#{lasting ? 'kept' : 'this build'}"
  bundle = Spaceship::ConnectAPI::BundleId.find(BUNDLE) or abort("no App ID #{BUNDLE} – register it first")
  # the Apple Watch app (08.11.2026): its own App ID, registered here the first time; HealthKit on both – the iPhone
  # starts the watch's golf workout, the watch runs it (the swings are felt only during one)
  watch = Spaceship::ConnectAPI::BundleId.find(WATCH_BUNDLE) ||
          Spaceship::ConnectAPI::BundleId.create(name: 'GolfOS Watch', platform: Spaceship::ConnectAPI::Platform::IOS, identifier: WATCH_BUNDLE)
  [bundle, watch].each do |b|
    has = b.get_capabilities.any? { |c| c.capability_type == Spaceship::ConnectAPI::BundleIdCapability::Type::HEALTHKIT }
    b.create_capability(Spaceship::ConnectAPI::BundleIdCapability::Type::HEALTHKIT) unless has
    puts "HEALTHKIT=#{b.identifier} #{has ? 'on' : 'switched on'}"
  rescue StandardError => e
    puts "HEALTHKIT=#{b.identifier} failed: #{e.message}"
  end
  name = "GolfOS GitHub #{ENV.fetch('GITHUB_RUN_NUMBER', Time.now.to_i)}"
  profile = Spaceship::ConnectAPI::Profile.create(
    name: name,
    profile_type: Spaceship::ConnectAPI::Profile::ProfileType::IOS_APP_STORE,
    bundle_id_id: bundle.id,
    certificate_ids: [cert.id]
  )
  watch_name = "#{name} Watch"
  watch_profile = Spaceship::ConnectAPI::Profile.create(
    name: watch_name,
    profile_type: Spaceship::ConnectAPI::Profile::ProfileType::IOS_APP_STORE,
    bundle_id_id: watch.id,
    certificate_ids: [cert.id]
  )

  File.write(File.join(dir, 'key.pem'), key.to_pem)
  File.binwrite(File.join(dir, 'cert.cer'), Base64.decode64(cert.certificate_content))
  File.binwrite(File.join(dir, 'profile.mobileprovision'), Base64.decode64(profile.profile_content))
  File.binwrite(File.join(dir, 'watch.mobileprovision'), Base64.decode64(watch_profile.profile_content))
  File.write(File.join(dir, 'ids.json'), JSON.generate(certificate: lasting ? nil : cert.id, profile: profile.id, watch_profile: watch_profile.id))
  puts "PROFILE_NAME=#{name}"
  puts "PROFILE_UUID=#{profile.uuid}"
  puts "WATCH_PROFILE_NAME=#{watch_name}"
  puts "WATCH_PROFILE_UUID=#{watch_profile.uuid}"
else
  ids = JSON.parse(File.read(File.join(dir, 'ids.json')))
  [ids['profile'], ids['watch_profile']].compact.each do |pid|
    Spaceship::ConnectAPI::Profile.get(profile_id: pid)&.delete!
  rescue StandardError => e
    warn "profile not removed: #{e.message}"
  end
  # a kept certificate (DIST_KEY_PEM) has no id here and stays
  begin
    ids['certificate'] && Spaceship::ConnectAPI::Certificate.get(certificate_id: ids['certificate'])&.delete!
  rescue StandardError => e
    warn "certificate not removed: #{e.message}"
  end
  puts 'removed'
end
