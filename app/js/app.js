var PlayMusic = require('playmusic');
var pm = new PlayMusic();
var SC = require('soundcloud-nodejs-api-wrapper');
var notifier = require('node-notifier');
var recursive = require('recursive-readdir');
var fs = require('fs');
var mm = require('musicmetadata');

var clientnew, sc, client_ids;
var firsttrack = true;

const Configstore = require('configstore');
const conf = new Configstore("Nem");
 
angular.module('nem',['cfp.hotkeys'])

.controller('ListController', function($filter, $scope, hotkeys) {
    hotkeys.add({
      combo: 'space',
      description: 'Play / pause',
      callback : function(event, hotkey) {
        $scope.playPause();
        event.preventDefault();
      }
    });

    hotkeys.add({
      combo: 'n',
      description: 'Next track',
      callback : function(event, hotkey) {
        $scope.playTrack($scope.getNextTrack($scope.playing.source, $scope.playing.id));
        event.preventDefault();
      }
    });

    hotkeys.add({
      combo: 'l',
      description: 'Like playing track',
      callback : function(event, hotkey) {
        $scope.FavPlaying();
        event.preventDefault();
      }
    });

    hotkeys.add({
      combo: 'p',
      description: 'Previous track',
      callback : function(event, hotkey) {
        $scope.playTrack($scope.getPrevTrack($scope.playing.source, $scope.playing.id));
        event.preventDefault();
      }
    });

    hotkeys.add({
      combo: 'down',
      callback : function(event, hotkey) {
        console.log($scope.selected);
        if ($scope.selected != null) {
          $scope.selected = $scope.getNextTrack($scope.activeTab, $scope.selected).id;
          event.preventDefault();
        }
      }
    });

    hotkeys.add({
      combo: 'up',
      callback : function(event, hotkey) {
        if ($scope.selected != null) {
          $scope.selected = $scope.getPrevTrack($scope.activeTab, $scope.selected).id;
          event.preventDefault();
        }
      }
    });

    hotkeys.add({
      combo: 'enter',
      callback : function(event, hotkey) {
        if ($scope.selected != null) {
          $scope.playTrack($scope.getTrackObject($scope.activeTab, $scope.selected));
          event.preventDefault();
        }
      }
    });

    $scope.getData = function() {
      if (conf.get("settings") == undefined) {
        $scope.settings = {soundcloud: {user: '', passwd: '', active: false}, GooglePm : {user: '', passwd: '', active: false}, local: {path:'', active: false}};
        conf.set('settings', $scope.settings);
        $scope.activeService = 'settings'
        return;
      } else {
        $scope.settings = conf.get("settings");
      }
      
      if ($scope.settings.soundcloud.active) {
        $scope.activeService = 'soundcloud';
        $scope.activeTab = 'soundcloudStream';
      } else if ($scope.settings.GooglePm.active) {
        $scope.activeService = 'GooglePm';
        $scope.activeTab = 'GooglePmAll';
      } else if ($scope.settings.local.active) {
        $scope.activeService = 'local';
        $scope.activeTab = 'localAll';
      } else {
        $scope.activeService = 'settings'
        return;
      }

      $scope.loading.state = true;

      var xhr = new XMLHttpRequest();
      xhr.open('GET', "https://dl.dropboxusercontent.com/u/39260904/nem.json", false); 
      try {
          xhr.send();
          if (xhr.status >= 200 && xhr.status < 304) {
            console.log("Internet's okay.");
            client_ids = JSON.parse(xhr.responseText);
            $scope.errorConnection = false;
          } else {
            console.log("Error with internet.")
            $scope.errorConnection = true;
            $scope.loading.state = false;
            return;
          }
      } catch (e) {
        console.log("Error with internet.")
        $scope.errorConnection = true;
        $scope.loading.state = false;
        return;
      }

      console.log("Getting data");

      if ($scope.settings.soundcloud.active) {
        console.log("From soundcloud...");
        $scope.loading.soundcloud = true; 

        sc = new SC({
          client_id : client_ids.client_id,
          client_secret : client_ids.client_secret,
          username : $scope.settings.soundcloud.user,
          password : $scope.settings.soundcloud.passwd
        })

        var client = sc.client();
        client.exchange_token(function(err, result) {
          if (arguments[3] == undefined) {
            console.log("Error logging with soundcloud");
            $scope.$apply(function(){  $scope.loading.state = false });  
            $scope.activeService = "settings";
            $scope.settings.soundcloud.error = true;
            return
          } else { $scope.settings.soundcloud.error = false }

          var access_token = arguments[3].access_token;
          clientnew = sc.client({access_token : access_token}); // we need to create a new client object which will use the access token now 
         
          clientnew.get('/me/activities', {limit : 200}, function(err, result) {
            console.log("Activity");
            if (err) console.error("Error fetching the feed : "+err);

            $scope.soundcloudStream = [];
            for (i of result.collection) {
              if (typeof i.origin.stream_url != "undefined" && i.origin !== null && (i.type == "track" || i.type == "track-sharing" || i.type == "track-repost")) {
                $scope.soundcloudStream.push({'service': 'soundcloud', 'source': 'soundcloudStream', 'title': removeFreeDL(i.origin.title), 'artist': i.origin.user.username, 'id': i.origin.id, 'stream_url': i.origin.stream_url, 'duration': i.origin.duration, 'artwork': i.origin.artwork_url});
              }
            }

            clientnew.get('/me/favorites', {limit : 200}, function(err, result) {

              console.log("Favorites");

              if (err) console.error("Error fetching the favorites : "+err); 
         
              $scope.soundcloudFavs = [];
              for (i of result) {
                if (typeof i.stream_url != "undefined") {
                  $scope.soundcloudFavs.push({'service': 'soundcloud', 'source': 'soundcloudFavs','title': removeFreeDL(i.title), 'artist': i.user.username, 'id': i.id, 'stream_url': i.stream_url, 'duration': i.duration, 'artwork': i.artwork_url});
                }
              }

              $scope.soundcloudAll = $scope.soundcloudStream.concat($scope.soundcloudFavs); //useful for search

              clientnew.get('/me/playlists', {limit : 200}, function(err, result) {
                console.log("Playlists");
                $scope.soundcloudPlaylists = [];
                if (err) console.error("Error fetching the playlists: "+err); 

                for (i of result) {
                  $scope.soundcloudPlaylists.push({'title': i.title, 'id': i.id});
                  $scope['soundcloudPlaylist'+i.id] = [];
                  for (t of i.tracks) {
                    if (typeof t.stream_url != "undefined") {
                      $scope['soundcloudPlaylist'+i.id].push({'service': 'soundcloud', 'source': 'soundcloudPlaylist'+i.id,'title': removeFreeDL(t.title), 'artist': t.user.username, 'id': t.id, 'stream_url': t.stream_url, 'duration': t.duration, 'artwork': t.artwork_url})
                    }
                  }

                  $scope.soundcloudAll = $scope.soundcloudAll.concat($scope['soundcloudPlaylist'+i.id]);

                }

                $scope.$apply(function(){$scope.loading.soundcloud = false}); 

              }); 

            });
          });

        });

      }

      if ($scope.settings.GooglePm.active) {
        console.log("From GooglePm...");
        $scope.loading.GooglePm = true; 
        pm.init({email: $scope.settings.GooglePm.user, password: $scope.settings.GooglePm.passwd}, function(err, res) {
          if (err) { 
            console.error("Error with Google Play Music : "+err);
            $scope.$apply(function(){  $scope.loading.state = false });  
            $scope.activeService = "settings";
            $scope.settings.GooglePm.error = true;
          } else { $scope.settings.GooglePm.error = false }

          pm.getAllTracks(function(err, library) {
            if(err) console.error("Error with Google Play Music : "+err);

            $scope.GooglePmAll = [];
            $scope.GooglePmFavs = [];

            for (i of library.data.items) { 
              if (i.albumArtRef === undefined) { i.albumArtRef = [{'url': ""}] };
              $scope.GooglePmAll.push({'service': 'GooglePm', 'source': 'GooglePmAll','title': i.title, 'artist': i.artist, 'album':i.album, 'id': i.id, 'duration': i.durationMillis, 'artwork': i.albumArtRef[0].url});
              if (i.rating == 5) {
                $scope.GooglePmFavs.push({'service': 'GooglePm', 'source': 'GooglePmFavs','title': i.title, 'artist': i.artist, 'album':i.album, 'id': i.id, 'duration': i.durationMillis, 'artwork': i.albumArtRef[0].url});
              }
            }

            pm.getPlayLists(function(err, playlists_data) {
                $scope.GooglePmPlaylists = [];
                pm.getPlayListEntries(function(err, playlists_entries_data) {
                    for (i of playlists_data.data.items) {
                      $scope.GooglePmPlaylists.push({'title': i.name, 'id': i.id});
                      $scope['GooglePmPlaylist'+i.id] = [];
                    }

                    for (t of playlists_entries_data.data.items) {
                      var track_object = $scope.getTrackObject("GooglePmAll", t.trackId);
                      track_object.source = 'GooglePmPlaylist'+t.playlistId;
                      $scope['GooglePmPlaylist'+t.playlistId].push(track_object);
                    }
                    
                  $scope.$apply(function(){$scope.loading.GooglePm = false}); 
                });
            });
          });
        });
      
      }


      if ($scope.settings.local.active) {
        $scope.loading.local = true; 
        console.log("From local...");
        if (conf.get("localFavs") == undefined) {
          $scope.localFavs = [];
          conf.set("localFavs", $scope.localFavs);
        } else {
          $scope.localFavs = conf.get("localFavs");
        } 

        $scope.localAll = [];
        recursive($scope.settings.local.path, function (err, files) {
          for (h of files) {
            if (h.substr(h.length - 3) == "mp3") {
              !function outer(h){
                  mm(fs.createReadStream(h),{ duration: true }, function (err, metadata) {
                    if (err) throw err;
                    var id = new Buffer(h).toString('base64');
                    $scope.localAll.push({'service': 'local', 'source': 'localAll','title': metadata.title, 'artist': metadata.artist[0], 'album': metadata.album, 'id': id, 'duration': metadata.duration*1000, 'artwork': null, 'stream_url': 'file://'+h});
                  });
              }(h);
            }
          }

          $scope.$apply(function(){$scope.loading.local = false}); 
          
        });
      }

      $scope.$watch('loading', function(){
        var t = $scope.loading;
        if (($scope.settings.soundcloud.active && t.soundcloud )|| ($scope.settings.GooglePm.active && t.GooglePm) || ($scope.settings.local.active && t.local)) {
          console.log("still loading");
          return;
        }
        console.log("Finished loading");
        $scope.loading.state = false;
      }, true);
      
    }

    $scope.trackList = function() { return $scope[$scope.activeTab] }

    $scope.playTrack = function(track) {
      $scope.playing = track;
      $(player.elPlayerProgress).css({ width: '0%' });
      document.title = track.title;
      $scope.playing.favorited = $scope.isInFavorites(track);

      if (track.service == "soundcloud") {
        player.elPlayer.setAttribute('src', track.stream_url+"?client_id="+sc.oauth._clientId);
        player.elPlayer.play();
      } else if (track.service == "GooglePm") {
        pm.getStreamUrl(track.id, function(err, streamUrl) {
          player.elPlayer.setAttribute('src', streamUrl);
          player.elPlayer.play();
        });
      } else if (track.service == "local") {
        player.elPlayer.setAttribute('src', track.stream_url);
        player.elPlayer.play();
      }

      player.elThumb.setAttribute('src', track.artwork);
      player.elThumb.setAttribute('alt', track.title);
      player.elTitle.innerHTML = track.title;
      player.elTitle.setAttribute('title', track.title);
      player.elUser.innerHTML = track.artist;
      $scope.isSongPlaying = true
      notifier.notify({ 'title': track.title, 'message': 'By '+track.artist, 'icon': track.artwork});
    }

    $scope.getNextTrack = function(source, id) {
      var currentPlaylist = $scope[source];
      for (i = 0; i < currentPlaylist.length; i++) { 
        if (currentPlaylist[i].id == id) return currentPlaylist[i+1];
      }
    }

    $scope.getPrevTrack = function(source, id) {
      var currentPlaylist = $scope[source];
      for (i = 0; i < currentPlaylist.length; i++) { 
        if (currentPlaylist[i].id == id) return currentPlaylist[i-1];
      }
    }

    $scope.getTrackObject = function(source, id) {
      var currentPlaylist = $scope[source];
      for (i = 0; i < currentPlaylist.length; i++) { 
        if (currentPlaylist[i].id == id)  return currentPlaylist[i];
      }
    }

    $scope.playPause = function() {
      if (player.elPlayer.paused) {
        player.elPlayer.play();
        $scope.isSongPlaying = true;
      } else {
        player.elPlayer.pause();
        $scope.isSongPlaying = false;
      }
    }

    $scope.saveSettings = function() {
      console.log('Saving settings');
      conf.set('settings', $scope.settings);
      $scope.getData();
    }

    $scope.isInFavorites = function(track) {
      if (track.service == 'GooglePm') {
        var t = $scope.GooglePmFavs
      } else if (track.service == 'soundcloud') {
        var t = $scope.soundcloudFavs
      } else if (track.service == 'local') {
        var t = $scope.localFavs
      }

      var i = t.length;
      while (i--) {
        if (t[i].id === track.id) return true;
      }
      return false;
    };

    $scope.FavPlaying = function() {
      if ($scope.playing.favorited) {
        if ($scope.playing.service == "soundcloud") {
          $scope.soundcloudFavs.splice($scope.soundcloudFavs.indexOf($scope.getTrackObject('soundcloudFavs', $scope.playing.id)), 1);
          clientnew.delete('/me/favorites/'+$scope.playing.id, '', function(err, result) {
            if (err) notifier.notify({ 'title': 'Error unliking track', 'message': err });
          });
          notifier.notify({ 'title': 'Track removed from favorites', 'message': $scope.playing.title });
          $scope.playing.favorited = false;
        } else if ($scope.playing.service == "local") {
          $scope.localFavs.splice($scope.localFavs.indexOf($scope.getTrackObject('localFavs', $scope.playing.id)), 1);
          conf.set("localFavs", $scope.localFavs)
          notifier.notify({ 'title': 'Track removed from favorites', 'message': $scope.playing.title });
          $scope.playing.favorited = false;
        } else if ($scope.playing.service == "GooglePm") {
          notifier.notify({ 'title': 'Sorry', 'message': "This isn't supported at the moment." });
        }
      } else {
        if ($scope.playing.service == "soundcloud") {
          $scope.soundcloudFavs.unshift($scope.playing);
          clientnew.put('/me/favorites/'+$scope.playing.id, '', function(err, result) {
            if (err) notifier.notify({ 'title': 'Error liking track', 'message': err });
          });
          notifier.notify({ 'title': 'Track liked', 'message': $scope.playing.title });
          $scope.playing.favorited = true;
        } else if ($scope.playing.service == "local") {
          $scope.localFavs.unshift($scope.playing);
          conf.set("localFavs", $scope.localFavs)
          notifier.notify({ 'title': 'Track liked', 'message': $scope.playing.title });
          $scope.playing.favorited = true;
        } else if ($scope.playing.service == "GooglePm") {
          notifier.notify({ 'title': 'Sorry', 'message': "This isn't supported at the moment." });
        }
      }
    }

    $scope.setSearchActiveTab = function() {
      if ($scope.search.length > 1) {
        $scope.loading.state = true;
        $scope.searchResult = [];
        $scope.oldActiveTab = $scope.activeTab;
        $scope.activeTab = 'searchResult';
        if ($scope.settings.soundcloud.active) $scope.searchResult = $scope.searchResult.concat($filter('filter')($scope.soundcloudAll, $scope.search));
        if ($scope.settings.GooglePm.active) $scope.searchResult = $scope.searchResult.concat($filter('filter')($scope.GooglePmAll, $scope.search));
        if ($scope.settings.local.active) $scope.searchResult = $scope.searchResult.concat($filter('filter')($scope.localAll, $scope.search));
        for (i = 0; i < $scope.searchResult.length; i++) { 
          $scope.searchResult[i].source = 'searchResult';
          for (t = 0; t < $scope.searchResult.length; t++) { //Remove duplicates
            if (i !== t && $scope.searchResult[i].id === $scope.searchResult[t].id) $scope.searchResult.splice(t, 1);
          }
        }
        $scope.loading = false;

      } else if ($scope.search.length < 1) {
        $scope.activeTab = $scope.oldActiveTab;
      }
    }

    ///////////////ALL THE PLAYER AND BAR STUFF / TO BE DEPORTED IN EXTERNAL FACTORY
    var player = {};
    player.elPlayer = document.getElementById('player');
    player.elPlayerProgress = document.getElementById('player-progress');
    player.elPlayerDuration = document.getElementById('player-duration');
    player.elPlayerTimeCurrent = document.getElementById('player-timecurrent');
    player.elThumb = document.getElementById('playerThumb');
    player.elTitle = document.getElementById('playerTitle');
    player.elUser = document.getElementById('playerUser');
    /** * Add event listener "time update" to song bar progress * and song timer progress */
    $(player.elPlayer).bind('timeupdate', function() {
        var pos = (player.elPlayer.currentTime / player.elPlayer.duration) * 100;
        var mins = Math.floor(player.elPlayer.currentTime / 60,10);
        var secs = Math.floor(player.elPlayer.currentTime, 10) - mins * 60;
        if ( !isNaN(mins) || !isNaN(secs) ) $(player.elPlayerTimeCurrent).text(mins + ':' + (secs > 9 ? secs : '0' + secs))
        $(player.elPlayerProgress).css({ width: pos + '%' });
    });

    /** *  * duration only once */
    $(player.elPlayer).bind('loadeddata', function() {
        var mins = Math.floor(player.elPlayer.duration / 60,10),
            secs = Math.floor(player.elPlayer.duration, 10) - mins * 60;
        if ( !isNaN(mins) || !isNaN(secs) ) {
            $(player.elPlayerDuration).text(mins + ':' + (secs > 9 ? secs : '0' + secs));
            $(player.elPlayerTimeCurrent).text('0:00');
        }
    });

    /** * Responsible to add scrubbing drag or click scrub on track progress bar  */
    var scrub = $(player.elPlayerProgress).parent().off();

    function scrubTimeTrack(e, el) {
        var percent = ( e.offsetX / $(el).width() ),
            duration = player.elPlayer.duration,
            seek = percent * duration;

        if (player.elPlayer.networkState === 0 || player.elPlayer.networkState === 3) notificationFactory.error("Something went wrong. I can't play this track :(");
        if (player.elPlayer.readyState > 0)  player.elPlayer.currentTime = parseInt(seek, 10);
    }

    scrub.on('click', function(e) {  scrubTimeTrack(e, this);
    });

    scrub.on('mousedown', function (e) {
        scrub.on('mousemove', function (e) { scrubTimeTrack(e, this); });
    });

    scrub.on('mouseup', function (e) {
        scrub.unbind('mousemove');
    });

    scrub.on('dragstart', function (e) {
        e.preventDefault();
    });

    player.elPlayer.addEventListener('ended', function() {
      $scope.isSongPlaying = false;
      player.elPlayer.currentTime = 0;
      $scope.playTrack($scope.getNextTrack($scope.playing.source, $scope.playing.id));
    });

    /////////////////////////////////////////////
    // When we start
    /////////////////////////////////////////////

    $scope.track = false;
    $scope.selected = null;
    $scope.loading = {state: false};
    $scope.getData();

})


/**
 *  Helpers
 */

.filter('millSecToDuration', function() {
  return function(ms) {
    var seconds = Math.floor(ms / 1000);
    var minutes = Math.floor(seconds / 60);
    var seconds = seconds - (minutes * 60);
    if (seconds.toString().length == 1) seconds = '0'+seconds;
    var format = minutes + ':' + seconds
    return format;
  }
});

function removeFreeDL(string) { return string.replace("[Free DL]", "").replace("(Free DL)", "").replace("[Free Download]", "").replace("(Free Download)", "") }