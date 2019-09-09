/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 * @flow
 */

import React, { Component } from 'react'
import {
  Platform,
  StyleSheet,
  Text,
  View,
  Dimensions,
  TouchableHighlight
} from 'react-native'
import {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  RTCView,
  MediaStream,
  MediaStreamTrack,
  mediaDevices
} from 'react-native-webrtc'

const screenHeight = Math.round(Dimensions.get('window').height)
const screenWidth = Math.round(Dimensions.get('window').width)

import io from 'socket.io-client'
import { YellowBox } from 'react-native'
console.ignoredYellowBox = ['Remote debugger']
YellowBox.ignoreWarnings([
  'Unrecognized WebSocket connection option(s) `agent`, `perMessageDeflate`, `pfx`, `key`, `passphrase`, `cert`, `ca`, `ciphers`, `rejectUnauthorized`. Did you mean to put these under `headers`?'
])
const instructions = Platform.select({
  ios: 'Press Cmd+R to reload,\n' + 'Cmd+D or shake for dev menu',
  android:
    'Double tap R on your keyboard to reload,\n' +
    'Shake or press menu button for dev menu'
})
const connectOptions = {
  secure: true,
  reconnect: true,
  rejectUnauthorized: false,
  transports: ['websocket']
}

const connectionConfig = {
  jsonp: false,
  reconnection: true,
  reconnectionDelay: 100,
  reconnectionAttempts: 100000,
  transports: ['websocket'] // you need to explicitly tell it to use websockets
}

// socket = io(socketPath, connectionConfig)

// socket.on('connect', function() {
//   console.log('Socket connectedco!')
// })
const configuration = { iceServers: [{ url: 'stun:stun.l.google.com:19302' }] }
const pc = new RTCPeerConnection(configuration)
let isFront = true

let socket
export default class App extends Component {
  constructor(props) {
    super(props)

    this.state = {
      user: {
        id: 't1'
      },
      call: {
        invite: false,
        other: ''
      },
      room: '',
      stream: '',
      remote: ''
    }

    socket = io('https://knowledgetalk.co.kr:7511/SignalServer', {
      secure: true,
      reconnect: true,
      rejectUnauthorized: false,
      transports: ['websocket']
    })

    socket.on('connect', () => {
      console.log('socket connected')
      this.forceLogin()
    })

    socket.on('connect_error', err => {
      console.log(err)
    })

    socket.on('knowledgetalk', this.handleSocketMessage)
  }

  handleSocketMessage = message => {
    const { eventOp, signalOp } = message
    console.log('receive message', message)
    switch (eventOp || signalOp) {
      case 'Invite': {
        console.log('invite')
        this.setState({
          call: {
            invite: true,
            other: message.userId
          },
          room: message.roomId
        })

        break
      }

      case 'SDP': {
        if (message.sdp && message.sdp.type === 'answer') {
          console.log('receive sdp answer')
          pc.setRemoteDescription(message.sdp).then(() => {
            console.log('connect answer sdp successfully')
          })
        }
        break
      }

      case 'Candidate': {
        if (message.candidate) {
          console.log('receive candiate from remote')
          pc.addIceCandidate(message.candidate).then(() => {
            console.log('candidate successfully')
          })
        }
        break
      }
    }
  }

  forceLogin = () => {
    console.log('login', {
      eventOp: 'Login',
      reqNo: '1',
      reqDate: '1',
      userId: 't1',
      userPw:
        'e3b98a4da31a127d4bde6e43033f66ba274cab0eb7eb1c70ec41402bf6273dd8',
      deviceType: 'pc',
      serviceType: 'multi'
    })
    this.send({
      eventOp: 'Login',
      reqNo: '1',
      reqDate: '1',
      userId: 't1',
      userPw:
        'e3b98a4da31a127d4bde6e43033f66ba274cab0eb7eb1c70ec41402bf6273dd8',
      deviceType: 'pc'
      // serviceType: 'multi'
    })
  }

  componentDidMount() {
    console.log('component did mount', pc)
  }
  call = target => {
    this.send({
      eventOp: 'Call',
      reqNo: 1,
      reqDate: 1,
      userId: this.state.user.id,
      reqDeviceType: 'multi',
      targetId: [target]
    })
  }

  accept = () => {
    this.send({
      eventOp: 'Invite',
      status: 'accept',
      roomId: this.state.room
    })

    this.send({
      eventOp: 'Join',
      status: 'accept',
      roomId: this.state.room,
      reqDate: 1,
      reqNo: 2,
      userId: this.state.user.id
    })

    this.initPeer()
  }

  initPeer = () => {
    mediaDevices.enumerateDevices().then(sourceInfos => {
      let videoSourceId
      for (let i = 0; i < sourceInfos.length; i++) {
        const sourceInfo = sourceInfos[i]
        if (
          sourceInfo.kind == 'videoinput' &&
          sourceInfo.facing == (isFront ? 'front' : 'back')
        ) {
          videoSourceId = sourceInfo.deviceId
        }
      }
      mediaDevices
        .getUserMedia({
          audio: true,
          video: {
            mandatory: {
              minWidth: 500, // Provide your own width, height and frame rate here
              minHeight: 300,
              minFrameRate: 30
            },
            facingMode: isFront ? 'user' : 'environment',
            optional: videoSourceId ? [{ sourceId: videoSourceId }] : []
          }
        })
        .then(stream => {
          // Got stream!
          this.setState({
            stream
          })
          console.log('stream', stream)
          pc.addStream(stream)

          pc.createOffer().then(desc => {
            pc.setLocalDescription(desc).then(() => {
              console.log('send sdp offer')
              this.send({
                eventOp: 'SDP',
                reqDate: 1,
                reqNo: 1,
                usage: 'cam',
                useMediaSvr: 'Y',
                roomId: this.state.room,
                userId: this.state.user.id,
                sdp: desc
              })
              // Send pc.localDescription to peer
            })
          })

          pc.onaddstream = e => {
            console.log('other stream', e.stream)
            this.setState({
              remote: e.stream.toURL()
            })
          }

          pc.onicecandidate = e => {
            // send event.candidate to peer
            if (!e.candidate) return
            console.log('send candidate')

            this.send({
              eventOp: 'Candidate',
              reqDate: 1,
              reqNo: 1,
              usage: 'cam',
              useMediaSvr: 'Y',
              roomId: this.state.room,
              userId: this.state.user.id,
              candidate: e.candidate
            })
          }
        })
        .catch(error => {
          // Log error
          console.error(error)
        })
    })
  }

  send = message => {
    socket.emit('knowledgetalk', message)
  }

  render() {
    const { stream, remote } = this.state
    // console.log('stream',stream.toURL())
    return (
      <View style={styles.container}>
        <View>
          {stream ? (
            <RTCView
              streamURL={stream.toURL()}
              style={styles.local}
              zOrder={10}
            />
          ) : null}
          {remote ? (
            <RTCView streamURL={remote} style={styles.local} zOrder={10} />
          ) : null}

          {/* <TouchableHighlight
            style={styles.button}
            onPress={this.call.bind(this, 't2')}
          >
            <Text> 전화걸기 (t2) </Text>
          </TouchableHighlight> */}
          <TouchableHighlight
            disabled={!this.state.call.invite}
            style={styles.button}
            onPress={this.accept}
          >
            <Text> 전화받기 </Text>
          </TouchableHighlight>

          {/* <TouchableHighlight
            disabled={!this.state.call.invite}
            style={styles.button}
            onPress={this.accept}
          >
            <Text> 전화끊기 </Text>
          </TouchableHighlight> */}
        </View>
      </View>
    )
  }
}

const styles = StyleSheet.create({
  local: {
    borderWidth: 1,
    flex: 1,
    width: screenWidth
  },
  remote: {
    flex: 1,
    borderWidth: 1,
    width: screenWidth
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  welcome: {
    fontSize: 20,
    textAlign: 'center',
    margin: 10
  },
  button: {
    alignItems: 'center',
    backgroundColor: '#DDDDDD',
    padding: 10,
    marginBottom: 2
  },
  instructions: {
    textAlign: 'center',
    color: '#333333',
    marginBottom: 5
  }
})
